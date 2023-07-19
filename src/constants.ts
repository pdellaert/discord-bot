import dotenv from 'dotenv';

export const GuildID = '1006392603861856376';

export enum Colors {
    FBW_CYAN = 0x00E0FE,
    FBW_PINK = 0xE92F8B,
}

export enum CommandCategory {
    AIRCRAFT = 'Aircraft',
    SUPPORT = 'Support',
    GENERAL = 'General',
    UTILS = 'Utilities',
    MEMES = 'Memes',
    MODERATION = 'Moderation',
}

export enum Channels {
    MOD_LOGS = '1014381667437264926',
    USER_LOGS = '1033458093205504170',
    SCAM_LOGS = '1033458069658685451',
    BOT_COMMANDS = '1058847308688666715',
    BIRTHDAY_CHANNEL = '1058847244515819540',
    A32NX_SUPPORT = '1058847172055011358',
    LOCALISATION = '1058847112382664774',
    FAQ = '1058847013573234769',
    ROLES = '1058846937522114690',
    PROGRESS = '1058846214134714408',
    A32NX_RELEASE = '1058846113232322670',
    FLIGHT_SCHOOL = '1058846038611460096',
    KNOWN_ISSUES = '1058845920445354044',
    SUPPORT_OPS = '1008125271632773320',
    EXP_CFMS_ISSUES = '1076978409357459556',
    VIDEOS = '1126719165055635566',
    CHAT = '1008017209169293422',
    SOUND = '1127302568612216892',
    CHATGPT_CHANNEL = '1094831842810663013',
}

export enum Threads {
    BIRTHDAY_THREAD = '1058847917143760896',
    COUNT_THREAD = '1058845382899155016',
}

export enum Roles {
    ADMIN_TEAM = '1007894736000004166',
    MODERATION_TEAM = '1007894345938120735',
    DEVELOPMENT_TEAM = '1058844130379300905',
    MEDIA_TEAM = '1058844348571201587',
    FBW_EMERITUS = '1058844326412685482',
    BOT_DEVELOPER = '1058844647742521384',
    COMMUNITY_SUPPORT = '1058844767598948354',
    CONTRIBUTOR = '758136468622409749',
    QA_TESTER = '749323930182877214',
    QA_TRAINEE = '779347636565442560',
}

export const RoleGroups = {
    STAFF: [Roles.ADMIN_TEAM, Roles.MODERATION_TEAM],
    TEAM: [Roles.ADMIN_TEAM, Roles.MODERATION_TEAM, Roles.DEVELOPMENT_TEAM, Roles.MEDIA_TEAM, Roles.FBW_EMERITUS],
    BOT: [Roles.ADMIN_TEAM, Roles.MODERATION_TEAM, Roles.BOT_DEVELOPER],
};

export const UserLogExclude = [
    '628400349979344919', // StickyBot
    '910632773117702185', //FBW Bot
    '856826179491594271', //FBW Staging bot
    '864492608163807302', //BenW test bot
    '1026371649450291250', //straks mod test bot
    '1026369609030443079', //straks sticky test bot
    '1006393814061170728', //straks user test bot
];

export const ModLogsExclude = [
    '910632773117702185', //FBW Bot
    '856826179491594271', //FBW Staging bot
    '864492608163807302', //BenW test bot
    '1026371649450291250', //straks mod test bot
    '1026369609030443079', //straks sticky test bot
    '1006393814061170728', //straks user test bot
];

export enum Units {
    DEGREES = '\u00B0',
    CELSIUS = '\u2103',
    KNOTS = 'kts',
}

// Custom emoji must be used. These custom emojis MUST be on the server the bot runs
// Identifier is determined through typing the following in the message box and pressing enter:
// \:A32:
// (Backslash<emoji code>)
// This returns a format like:
// <:A32:1044359345493790850>
// Strip <, > and the first :, add this entry below. Anything else will not work.
export const AircraftTypeList = {
    //a32nx: '32:1044695612337168494',
    //a380x: '38:1044695718348210177',
    a32nx: 'A32:1044359345493790850',
    a380x: 'A38:1044359365949403166',
};

export const PermissionsEmbedDelay = 15000;

// imageBaseUrl - Below takes the IMAGE_BASE_URL entry from the `env` and strips the trailing `/` if present

dotenv.config();
const originalBaseUrl = `${process.env.IMAGE_BASE_URL}`;
const imageBaseUrl = originalBaseUrl.endsWith('/') ? originalBaseUrl.slice(0, -1) : originalBaseUrl;
export { imageBaseUrl };
