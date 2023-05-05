import Filter from 'bad-words';
import { Colors } from 'discord.js';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import { PineconeClient, QueryRequest } from '@pinecone-database/pinecone';
import { CommandDefinition, replyWithEmbed, replyWithMsg } from '../../lib/command';
import { CommandCategory } from '../../constants';
import { makeEmbed } from '../../lib/embed';
import Logger from '../../lib/logger';

const DOCS_BASE_URL = 'https://docs.flybywiresim.com';
const OPENAI_MAX_ATTEMPTS = 5;
const OPENAI_MAX_CONTEXT_CHAR_LENGTH = 16000;
const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';
const OPENAI_QUERY_MODEL = 'gpt-4';
const OPENAI_TEMPERATURE = 0;
const PINECONE_NUMBER_OF_RESULTS = 1;
const MIN_VECTOR_SCORE = 0.75;

const PINCONE_API_KEY = process.env.PINECONE_API_KEY || '';
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT || '';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || '';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const NO_ANSWER = `I'm not sure, perhaps you can rephrase the question or find the answer in our documentation: <${DOCS_BASE_URL}>`;

const noQueryEmbed = makeEmbed({
    title: 'FlyByWire Chat Bot - Documentation',
    description: `Find the full [FlyByWire Documentation here](${DOCS_BASE_URL}).`,
});

const failedEmbed = makeEmbed({
    title: 'FlyByWire Chat Bot - Query failed',
    description: `The query failed, please check the full [FlyByWire Documentation here](${DOCS_BASE_URL}) and use the regular search functionality.`,
});

interface pineconeMetadata {
    text?: string,
    url?: string,
}

export const chat: CommandDefinition = {
    name: ['chat'],
    description: 'Uses Chat-GPT to search for an answer in our documentation.',
    category: CommandCategory.UTILS,
    executor: async (msg) => {
        const actualMessage = msg.content.startsWith('.chat ') ? msg.content : `.chat ${msg.content}`;
        const searchWords = actualMessage.split(/\s+/).slice(1);

        if (searchWords.length === 0) {
            return replyWithEmbed(msg, noQueryEmbed);
        }

        // Safety to prevent users from sending their own links in bot output.
        for (const searchWord of searchWords) {
            try {
                const _ = new URL(searchWord);
                const URLEmbed = makeEmbed({
                    title: 'FlyByWire Documentation | Error',
                    description: 'Providing URLs to the Documentation search command is not allowed.',
                    color: Colors.Red,
                });
                return msg.reply({ embeds: [URLEmbed] });
            } catch (_) { /**/ }

            const filter = new Filter();
            if (filter.isProfane(searchWord)) {
                return msg.reply('Please do not use profane language with this command.');
            }
        }

        let searchQuery = searchWords.join(' ');
        searchQuery = searchQuery.indexOf('?') > 0 ? searchQuery : `${searchQuery}?`;

        const configuration = new Configuration({ apiKey: OPENAI_API_KEY });
        const openaiClient = new OpenAIApi(configuration);
        // TODO: Check if healthy client
        const pineconeClient = new PineconeClient();
        await pineconeClient.init({
            apiKey: PINCONE_API_KEY,
            environment: PINECONE_ENVIRONMENT,
        });
        const pineconeIndex = pineconeClient.Index(PINECONE_INDEX_NAME);
        return msg.reply('Processing... Please stand by.').then(async (postedMessage) => {
            msg.channel.sendTyping();
            let embeddingResult;
            let attempt = 0;
            let done = false;
            while (!done && attempt <= OPENAI_MAX_ATTEMPTS) {
                if (attempt > 0) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((f) => setTimeout(f, 2000));
                }
                try {
                    // eslint-disable-next-line no-await-in-loop
                    embeddingResult = await openaiClient.createEmbedding({
                        model: OPENAI_EMBEDDING_MODEL,
                        input: [searchQuery],
                    });
                    done = true;
                } catch {
                    continue;
                } finally {
                    attempt += 1;
                }
            }
            if (!done || !embeddingResult.data.data[0].embedding) {
                try {
                    await postedMessage.delete();
                } catch (e) {
                    Logger.debug(`Error: ${e}`);
                }
                return replyWithEmbed(msg, failedEmbed);
            }
            const pineconeQueryRequest: QueryRequest = {
                topK: PINECONE_NUMBER_OF_RESULTS,
                vector: embeddingResult.data.data[0].embedding,
                namespace: PINECONE_NAMESPACE,
                includeMetadata: true,
            };
            const pineconeResult = await pineconeIndex.query({ queryRequest: pineconeQueryRequest });
            const filteredMatches = pineconeResult.matches.filter((e) => e.score >= MIN_VECTOR_SCORE);
            if (filteredMatches.length === 0) {
                const highestScoreVector = pineconeResult.matches.reduce((prev, current) => (prev.score > current.score ? prev : current));
                Logger.debug(`No valid context found - highest score: ${highestScoreVector.score} - score needed: ${MIN_VECTOR_SCORE}`);
                try {
                    await postedMessage.delete();
                } catch (e) {
                    Logger.debug(`Error: ${e}`);
                }
                return msg.reply(NO_ANSWER);
            }
            let contextLength = 0;
            let countContexts = 0;
            let totalScore = 0;
            const queryMessages: ChatCompletionRequestMessage[] = [
                {
                    role: 'system',
                    content: ''.concat(
                        'You are the FlyByWire Discord bot who answers a question based on the provided contexts and user question.',
                        'Instructions:\n',
                        '- Answer the question based on the context below and include all relevant information, consider the scores of the contexts when answering\n',
                        '- If the question can be answered, you should include the URL of the most used Context. Do not mention you got information from a Context.\n',
                        '- Any URL must be prepended with "<" and appended with ">"\n',
                        `- If the question can not be answered, you must answer with exactly "${NO_ANSWER}"\n`,
                    ),
                },
            ];
            for (const match of filteredMatches) {
                if ('text' in match.metadata && 'url' in match.metadata) {
                    const matchMetadata = match.metadata as pineconeMetadata;
                    const { text, url } = matchMetadata;
                    if (typeof text === 'string' && typeof url === 'string' && contextLength + text.length <= OPENAI_MAX_CONTEXT_CHAR_LENGTH) {
                        countContexts += 1;
                        queryMessages.push({
                            role: 'user',
                            content: `Context ${countContexts}:\n`.concat(
                                `URL: ${url}\n`,
                                `Score: ${match.score}\n`,
                                `Content: ${text}`,
                            ),
                        });
                        contextLength += text.length;
                        totalScore += match.score;
                    }
                }
            }
            const averageScore = countContexts > 0 ? totalScore / countContexts : 0;

            try {
                const response = await openaiClient.createChatCompletion({
                    model: OPENAI_QUERY_MODEL,
                    temperature: OPENAI_TEMPERATURE,
                    max_tokens: 500,
                    messages: queryMessages,
                });
                if (response.data.choices.length > 0) {
                    const { usage } = response.data;
                    // eslint-disable-next-line camelcase
                    const { completion_tokens, prompt_tokens, total_tokens } = usage;
                    // eslint-disable-next-line camelcase
                    Logger.debug(`Average confidence: ${Math.round(averageScore * 1000) / 1000} - Number of Contexts: ${countContexts} - Prompt tokens: ${prompt_tokens} - Completion tokens: ${completion_tokens} - Total tokens: ${total_tokens}`);
                    try {
                        await postedMessage.delete();
                    } catch (e) {
                        Logger.debug(`Error: ${e}`);
                    }
                    return replyWithMsg(msg, response.data.choices[0].message.content);
                }
            } catch (e) {
                Logger.debug(`Error: ${e}`);
            }
            try {
                await postedMessage.delete();
            } catch (e) {
                Logger.debug(`Error: ${e}`);
            }
            return msg.reply(NO_ANSWER);
        }).catch(() => msg.reply(NO_ANSWER));
    },
};
