import Filter from 'bad-words';
import { Colors } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import { PineconeClient, QueryRequest } from '@pinecone-database/pinecone';
import { CommandDefinition, replyWithEmbed } from '../../lib/command';
import { CommandCategory } from '../../constants';
import { makeEmbed } from '../../lib/embed';

const DOCS_BASE_URL = 'https://docs.flybywiresim.com';
const OPENAI_MAX_ATTEMPTS = 5;
const OPENAI_MAX_CONTEXT_LENGTH = 2500;
const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';
const OPENAI_QUERY_MODEL = 'text-davinci-003';
const OPENAI_TEMPERATURE = 0.5;
const PINECONE_NUMBER_OF_RESULTS = 3;
const MIN_VECTOR_SCORE = 0.7;

const PINCONE_API_KEY = process.env.PINECONE_API_KEY || '';
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT || '';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || '';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const noQueryEmbed = makeEmbed({
    title: 'FlyByWire Chat Bot - Documentation',
    description: `Find the full [FlyByWire Documentation here](${DOCS_BASE_URL}).`,
});

const failedEmbed = makeEmbed({
    title: 'FlyByWire Chat Bot - Query failed',
    description: `The query failed, please check the full [FlyByWire Documentation here](${DOCS_BASE_URL}) and use the regular search functionality.`,
});

const noScoreHighEnoughEmbed = (score) => makeEmbed({
    title: 'FlyByWire Chat Bot - No valid results found',
    description: 'The query did not result in a context with high enough score to satisfy a good answer.',
    footer: { text: `Minimum score needed: ${MIN_VECTOR_SCORE}, Highest score found: ${score}` },
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
        const searchWords = actualMessage.split(/\n|\r|\.|-|>/)
            .at(1).split(/\s+/).slice(1);

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
            return replyWithEmbed(msg, noScoreHighEnoughEmbed(highestScoreVector.score));
        }
        const queryContextTexts = [];
        const queryContextUrls = [];
        let contextLength = 0;
        let countContexts = 0;
        let totalScore = 0;
        for (const match of filteredMatches) {
            if ('text' in match.metadata && 'url' in match.metadata) {
                const matchMetadata = match.metadata as pineconeMetadata;
                const { text, url } = matchMetadata;
                if (typeof text === 'string' && typeof url === 'string' && contextLength + text.length <= OPENAI_MAX_CONTEXT_LENGTH) {
                    queryContextTexts.push(text);
                    queryContextUrls.push(url);
                    contextLength += text.length;
                    countContexts += 1;
                    totalScore += match.score;
                }
            }
        }
        const averageScore = countContexts > 0 ? totalScore / countContexts : 0;
        const queryText = ''.concat(
            'Answer the question based on the context below and you must include exactly one of the URLs as a reference at the end with the words "For more details: " unless the question can not be answered. If the question can not be answered based on the context, say "I don\'t know" and do not include a URL\n\n',
            'Context: ',
            queryContextTexts.join('\n'),
            '\n---\n',
            'URLs:',
            queryContextUrls.join('\n'),
            '\n---\n',
            'Question: ',
            searchQuery,
            '\n',
            'Answer:',
        );

        const response = await openaiClient.createCompletion({
            model: OPENAI_QUERY_MODEL,
            prompt: queryText,
            temperature: OPENAI_TEMPERATURE,
            frequency_penalty: 0,
            max_tokens: 1024,
        });

        if (response.data.choices.length > 0) {
            const queryEmbed = makeEmbed({
                title: 'FlyByWire Chat Bot',
                description: response.data.choices[0].text,
                footer: { text: `Average confidence: ${Math.round(averageScore * 1000) / 1000} - Number of Contexts: ${countContexts}` },
            });
            return replyWithEmbed(msg, queryEmbed);
        }
        return replyWithEmbed(msg, noQueryEmbed);
    },
};
