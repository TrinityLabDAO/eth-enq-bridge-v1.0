const { createLogger, format, transports } = require('winston');
const config = require("./config.json");
const logger = createLogger({
    level: config.loglevel,
    format: format.combine(
        format.colorize(),
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.printf(info => `${info.timestamp} ${info.level}: ${((typeof info.message) === "object" ? JSON.stringify(info.message) : info.message)}`)
    ),
    transports: [new transports.Console()]
});
module.exports = logger;