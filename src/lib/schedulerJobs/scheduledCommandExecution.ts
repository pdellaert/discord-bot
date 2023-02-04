import { TextChannel, Colors, EmbedField } from 'discord.js';
import { Job } from 'agenda';
import { Channels } from '../../constants';
import { client } from '../..';
import { makeEmbed } from '../embed';
import Logger from '../logger';
import { getScheduler } from '../scheduler';
import { CommandDefinition } from '../command';
import { ban } from '../../commands/moderation/ban';
import { slowMode } from '../../commands/moderation/slowmode';
import { timeout } from '../../commands/moderation/timeout';
import { unban } from '../../commands/moderation/unban';
import { untimeout } from '../../commands/moderation/untimeout';
import { warn } from '../../commands/moderation/warn/warn';

const supportedCommands: CommandDefinition[] = [
    ban,
    slowMode,
    timeout,
    unban,
    untimeout,
    warn,
];

const modLogEmbed = (action: string, fields: any, color: number) => makeEmbed({
    title: `Scheduled Command - ${action}`,
    fields,
    color,
});

const scheduledCommandEmbedField = (id: string, moderator: string, command: string, parameters: string, time: string): EmbedField[] => [
    {
        inline: true,
        name: 'ID',
        value: id,
    },
    {
        inline: true,
        name: 'Command',
        value: command,
    },
    {
        inline: true,
        name: 'Parameters',
        value: parameters || '',
    },
    {
        inline: true,
        name: 'Execution time',
        value: time,
    },
    {
        inline: true,
        name: 'Moderator',
        value: moderator,
    },
];

export async function scheduledCommandExecution(job: Job) {
    const scheduler = getScheduler();
    // Needed because of https://github.com/agenda/agenda/issues/401
    const { _id: id } = job.attrs;
    // eslint-disable-next-line no-underscore-dangle
    const matchingJobs = await scheduler.jobs({ _id: id });
    if (matchingJobs.length !== 1) {
        Logger.debug('Job has been deleted already, skipping execution.');
        return;
    }
    const { commandText, parameters, moderator } = job.attrs.data;
    const modLogsChannel = client.channels.resolve(Channels.MOD_LOGS) as TextChannel | null;
    const foundCommand = supportedCommands.find((supportedCommand) => supportedCommand.name === commandText);
    if (!modLogsChannel) {
        Logger.error(`Sheduled command job with ID ${id} and command ${commandText} will not be executed because there is no Mod Log Channel.`);
        try {
            await job.remove();
        } catch (err) {
            Logger.error(`Failed to delete scheduled job with ID ${id}: ${err}`);
        }
        return;
    }
    if (!foundCommand) {
        Logger.error(`Scheduled command job with ID ${id} not executed because command ${commandText} is not supported`);
        try {
            const embedFields: EmbedField[] = scheduledCommandEmbedField(
                id.toString(),
                moderator,
                commandText,
                parameters,
                new Date().toUTCString(),
            );
            embedFields.push({
                inline: false,
                name: 'Failed Execution',
                value: `The provided \`${commandText}\` command is not a supported command for scheduling and execution is not possible.`,
            });
            modLogsChannel.send({
                embeds: [modLogEmbed(
                    'Execution',
                    embedFields,
                    Colors.Red,
                )],
            });
        } catch (err) {
            Logger.error(`Failed to send Mod Log message for failed execution for scheduled job with ID ${id}: ${err}`);
        }
        try {
            await job.remove();
        } catch (err) {
            Logger.error(`Failed to delete scheduled job with ID ${id}: ${err}`);
        }
    }

    Logger.debug(`Executing Scheduled Command with ID ${id} and command ${commandText}`);
    //try {
    //    await foundCommand.executor(msg, client);
    //} catch (err) {
    //    Logger.error(`Failed to execute Scheduled Command job with ID ${id} and command ${commandText}: ${err}`);
    //}
    try {
        await job.remove();
    } catch (err) {
        Logger.error(`Failed to delete scheduled job with ID ${id}: ${err}`);
    }

    try {
        await modLogsChannel.send({
            embeds: [modLogEmbed('Execution', scheduledCommandEmbedField(
                id.toString(),
                moderator,
                commandText,
                parameters,
                new Date().toUTCString(),
            ),
            Colors.Green)],
        });
    } catch (err) {
        Logger.warn(`Failed to send Mod Log for Scheduled Command Execution of job with ID ${id} and command ${commandText}: ${err}`);
    }
}
