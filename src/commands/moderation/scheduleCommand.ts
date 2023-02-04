import { Colors, EmbedField, TextChannel } from 'discord.js';
import { Job } from 'agenda';
import mongoose from 'mongoose';
import { CommandDefinition } from '../../lib/command';
import { Roles, Channels, CommandCategory } from '../../constants';
import { makeEmbed } from '../../lib/embed';
import { getScheduler } from '../../lib/scheduler';
import { client } from '../..';
import { ban } from './ban';
import { slowMode } from './slowmode';
import { timeout } from './timeout';
import { unban } from './unban';
import { untimeout } from './untimeout';
import { warn } from './warn/warn';
import Logger from '../../lib/logger';

const permittedRoles = [
    Roles.ADMIN_TEAM,
    Roles.MODERATION_TEAM,
];

enum TimeConversions {
    SECONDS_TO_MILLISECONDS = 1000,
    MINUTES_TO_MILLISECONDS = 60 * 1000,
    HOURS_TO_MILLISECONDS = 60 * 60 * 1000,
    DAYS_TO_MILLISECONDS = 60 * 60 * 24 * 1000,
}

const supportedCommands: CommandDefinition[] = [
    ban,
    slowMode,
    timeout,
    unban,
    untimeout,
    warn,
];

const helpEmbed = (evokedCommand: String) => makeEmbed({
    title: 'Schedule commands - Help',
    description: 'A command to manage the execution of other commands at a specific schedule.',
    fields: [
        {
            name: 'Timer parameter',
            value: 'In what time to execute the command, from the current moment. It needs to be provided with an indication like s, m, h or d. Which respectively stand for seconds, minutes, hours or days.',
            inline: false,
        },
        {
            name: 'Command parameter',
            value: 'The command to execute, this is the regular command without the `.`, for instance `warn`.',
            inline: false,
        },
        {
            name: 'Options parameter',
            value: 'The options that the command expects. Check the command help to figure out its specific options.',
            inline: false,
        },
        {
            name: `Scheduling a command: \`${evokedCommand} add <timer> <command> [options]\``,
            value: 'Schedule the execution of a specific command with the provided options/parameters after the timer has expired.',
            inline: false,
        },
        {
            name: `Delete a scheduled command: \`${evokedCommand} delete <ID>\``,
            value: 'Delete a scheduled command based on its ID, which can be found with the list command.',
            inline: false,
        },
        {
            name: `List scheduled commands: \`${evokedCommand} list [command]\``,
            value: 'List the scheduled commands, if a command is specified it will only list the ones matching the command.',
            inline: false,
        },
    ],
});

const failedEmbed = (action: string, info: string) => makeEmbed({
    title: `Schedule Command - ${action} failed`,
    description: `Failed to ${action} a scheduled command (\`${info}\`).`,
    color: Colors.Red,
});

const modLogEmbed = (action: string, fields: any, color: number) => makeEmbed({
    title: `Schedule Command - ${action}`,
    fields,
    color,
});

const missingInfoEmbed = (action: string, information: string) => makeEmbed({
    title: `Schedule Command - ${action} - missing information`,
    description: `${information}`,
    color: Colors.Red,
});

const noChannelEmbed = (action:string, channelName: string) => makeEmbed({
    title: `Schedule Command - ${action} - No ${channelName} channel`,
    description: `The command was successful, but no message to ${channelName} was sent. Please check the channel still exists.`,
    color: Colors.Yellow,
});

const noSchedulerEmbed = makeEmbed({
    title: 'Schedule Command - No scheduler',
    description: 'Could not find an active scheduler. No automatic disable can be scheduled.',
    color: Colors.Red,
});

const noPermEmbed = makeEmbed({
    title: 'Schedule Command - Permission missing',
    description: 'You do not have permission to use this command.',
    color: Colors.Red,
});

const listEmbed = (fields: EmbedField[], count: number) => makeEmbed({
    title: 'Schedule Commands - List',
    description: `List of ${count} Scheduled Commands matching the search.`,
    fields,
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

export const scheduleCommand: CommandDefinition = {
    name: ['schedule', 'schedulecommand'],
    description: 'Manage the execution of commands at a scheduled time.',
    category: CommandCategory.MODERATION,
    executor: async (msg) => {
        const subCommands = ['list', 'add', 'delete'];
        const scheduler = getScheduler();
        if (!scheduler) {
            await msg.channel.send({ embeds: [noSchedulerEmbed] });
        }

        const hasPermittedRole = msg.member.roles.cache.some((role) => permittedRoles.map((r) => r.toString()).includes(role.id));
        if (!hasPermittedRole) {
            return msg.channel.send({ embeds: [noPermEmbed] });
        }

        const modLogsChannel = client.channels.resolve(Channels.MOD_LOGS) as TextChannel | null;
        const { author } = msg;
        const [evokedCommand] = msg.content.trim().split(/\s+/);
        const args = msg.content.replace(evokedCommand, '').trim();
        if (!args || args === 'help') {
            return msg.channel.send({ embeds: [helpEmbed(evokedCommand)] });
        }

        let [subCommand] = args.split(/\s+/);
        let subArgs = args.replace(subCommand, '').trim();
        if (!subCommands.includes(subCommand)) {
            subCommand = 'list';
            subArgs = args;
        }

        if (subCommand === 'add') {
            const timerRegexCheck = /^(?<timer>[\d]+[s|m|h|d])\s*.*$/s;
            const timerRegexMatches = subArgs.toLowerCase().match(timerRegexCheck);
            if (timerRegexMatches === null || !timerRegexMatches.groups.timer) {
                return msg.channel.send({ embeds: [missingInfoEmbed('Add', 'You must provide a timer.')] });
            }
            const { timer } = timerRegexMatches.groups;
            subArgs = subArgs.replace(timer, '').trim();

            const commandRegexCheck = /^(?<commandText>[\w]+)\s*.*$/s;
            const commandRegexMatches = subArgs.match(commandRegexCheck);
            if (commandRegexMatches === null || !commandRegexMatches.groups.commandText) {
                return msg.channel.send({ embeds: [missingInfoEmbed('Add', 'You must provide a command.')] });
            }
            const { commandText } = commandRegexMatches.groups;
            const foundCommand = supportedCommands.find((supportedCommand) => supportedCommand.name === commandText);
            if (!foundCommand) {
                return msg.channel.send({ embeds: [missingInfoEmbed('Add', `The provided \`${commandText}\` command is not a supported command for scheduling.`)] });
            }
            subArgs = subArgs.replace(commandText, '').trim();

            const parametersRegexCheck = /^(?:(?<parameters>[\w\s]+))?\s*$/s;
            const parametersRegexMatches = subArgs.match(parametersRegexCheck);
            let parameters;
            if (parametersRegexMatches && parametersRegexMatches.groups) {
                ({ parameters } = parametersRegexMatches.groups);
            }

            let timerMillis: number;
            switch (timer[timer.length - 1].toLowerCase()) {
            default: {
                // defaults to minutes; 'm' will also run this block
                timerMillis = parseInt(timer.replace('s', '')) * TimeConversions.SECONDS_TO_MILLISECONDS;
                break;
            }
            case 'm': {
                timerMillis = parseInt(timer.replace('m', '')) * TimeConversions.MINUTES_TO_MILLISECONDS;
                break;
            }
            case 'h': {
                timerMillis = parseInt(timer.replace('h', '')) * TimeConversions.HOURS_TO_MILLISECONDS;
                break;
            }
            case 'd': {
                timerMillis = parseInt(timer.replace('d', '')) * TimeConversions.DAYS_TO_MILLISECONDS;
                break;
            }
            }
            const executionDate: Date = new Date(Date.now() + timerMillis);
            let scheduledJob: Job;
            try {
                scheduledJob = await scheduler.schedule(executionDate, 'scheduledCommandExecution', { commandText, parameters, moderator: author.toString() });
            } catch (err) {
                Logger.error(`Failed to add ${commandText} scheduled command: ${err}`);
                return msg.channel.send({ embeds: [failedEmbed('Add', commandText)] });
            }

            try {
                await modLogsChannel.send({
                    embeds: [modLogEmbed('Add',
                        scheduledCommandEmbedField(
                            // eslint-disable-next-line no-underscore-dangle
                            scheduledJob.attrs._id.toString(),
                            author.toString(),
                            commandText,
                            parameters,
                            executionDate.toUTCString(),
                        ),
                        Colors.Green)],
                });
            } catch (err) {
                msg.channel.send({ embeds: [noChannelEmbed('Add', 'Mod Log')] });
            }

            return msg.react('✅');
        }

        if (subCommand === 'delete') {
            const idRegexCheck = /^(?<id>[\w]+)\s*$/s;
            const idRegexMatches = subArgs.toLowerCase().match(idRegexCheck);
            if (idRegexMatches === null || !idRegexMatches.groups.id) {
                return msg.channel.send({ embeds: [missingInfoEmbed('Add', 'You must provide a timer.')] });
            }
            const { id } = idRegexMatches.groups;
            const matchingJobs = await scheduler.jobs({ _id: new mongoose.Types.ObjectId(id) });
            if (matchingJobs.length !== 1) {
                return msg.channel.send({ embeds: [missingInfoEmbed('Delete', `Scheduled command with \`${id}\` can not be found.`)] });
            }
            const [job] = matchingJobs;
            try {
                await job.remove();
            } catch {
                return msg.channel.send({ embeds: [failedEmbed('Delete', id)] });
            }

            try {
                const { commandText, parameters } = job.attrs.data;
                const { nextRunAt } = job.attrs;
                await modLogsChannel.send({
                    embeds: [modLogEmbed('Delete',
                        scheduledCommandEmbedField(
                            // eslint-disable-next-line no-underscore-dangle
                            id,
                            author.toString(),
                            commandText,
                            parameters,
                            nextRunAt.toUTCString(),
                        ),
                        Colors.Green)],
                });
            } catch {
                msg.channel.send({ embeds: [noChannelEmbed('Add', 'Mod Log')] });
            }

            return msg.react('✅');
        }

        if (subCommand === 'list') {
            const commandRegexCheck = /^(?<commandText>[\w]+)\s*.*$/s;
            const commandRegexMatches = subArgs.match(commandRegexCheck);
            let commandText;
            if (commandRegexMatches && commandRegexMatches.groups) {
                ({ commandText } = commandRegexMatches.groups);
            }
            let jobs: Job[];
            if (commandText) {
                jobs = await scheduler.jobs(
                    {
                        name: 'scheduledCommandExecution',
                        data: { commandText },
                    },
                    { nextRunAt: 1 },
                );
            } else {
                jobs = await scheduler.jobs({ name: 'scheduledCommandExecution' }, { nextRunAt: 1 });
            }

            const embedFields: EmbedField[] = jobs.map((job) => {
                const { _id: id, data, nextRunAt } = job.attrs;
                const { commandText, parameters, moderator } = data;
                return scheduledCommandEmbedField(
                    id.toString(),
                    moderator,
                    commandText,
                    parameters,
                    nextRunAt.toUTCString(),
                );
            }).flat();

            return msg.channel.send({ embeds: [listEmbed(embedFields, jobs.length)] });
        }

        return msg.channel.send({ embeds: [helpEmbed(evokedCommand)] });
    },
};
