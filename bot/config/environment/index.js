import { merge } from 'lodash'

const config = {
  env: process.env.NODE_ENV || 'local',
  sentry: {
    dsn: process.env.SENTRY_DSN,
  },
  datadog: {
    apiKey: process.env.DATA_DOG_API_KEY,
    appKey: process.env.DATA_DOG_APP_KEY,
    botServiceCheck: process.env.DATA_DOG_BOT_SERVICE_CHECK || 'dev.bot.up',
    host: process.env.DATA_DOG_HOST || '172.17.0.1',
    enabled: true,
  },
  winston: {
    logger: {
      console: {
        level: process.env.WINSTON_LOGGER_CONSOLE_LEVEL || 'info',
        depth: parseInt(process.env.WINSTON_LOGGER_CONSOLE_DEPTH, 10) || 3,
        prettyPrint: parseInt(process.env.WINSTON_LOGGER_CONSOLE_PRETTY_PRINT, 10) === 1 || true,
      },
    },
  },
  firehose: {
    bucket: {
      arn: process.env.FIREHOSE_BUCKET_ARN,
    },
    cloudwatch: {
      enabled: true,
      logGroupName: process.env.FIREHOSE_CLOUDWATCH_LOGGROUPNAME,
    },
    role: {
      arn: process.env.FIREHOSE_ROLE_ARN,
    },
    buffer: {
      seconds: process.env.FIREHOSE_BUFFER_SECONDS || 300,
      size: process.env.FIREHOSE_BUFFER_SIZE || 5,
    },
    events: {
      exclude: ['presence_change', 'reconnect_url'],
    },
  },
  redis: {
    host: process.env.REDIS_HOST,
  },
  middleware: {
    firehose: {
      enabled: false,
    },
  },
  thread: {
    mutex: {
      timeout: 5000,
      retryInterval: 20,
    },
  },
  mixpanel: {
    token: process.env.MIXPANEL_TOKEN,
    verbose: parseInt(process.env.MIXPANEL_VERBOSE, 10) === 1,
  },
  luno: {
    channel: process.env.LUNO_CHANNEL,
    token: process.env.LUNO_TOKEN,
    listenToChannels: process.env.LUNO_LISTEN_TO_CHANNELS,
  },
  maxConnectionRetries: process.env.MAX_CONNECTION_RETRIES || 5,
}

export default merge(config, require(`./${config.env}`).default)
