export default {
  sentry: {
    dsn: 'https://acdfd43baa9d4280a9d97aa5b4db906d:9b3a1cc598a04c8283279b5be33713a4@app.getsentry.com/75754',
  },
  winston: {
    logger: {
      console: {
        level: process.env.WINSTON_LOGGER_CONSOLE_LEVEL || 'info',
      },
    },
  },
  firehose: {
    bucket: {
      arn: 'arn:aws:s3:::dev-bot-firehose',
    },
    cloudwatch: {
      logGroupName: 'dev-lunohq-botFirehose-LogGroup-14SI2YYP4VN50',
    },
    role: {
      arn: 'arn:aws:iam::487220619225:role/dev-lunohq-botFirehose-FirehoseRole-L9UFLQYGXSKG',
    },
  },
  middleware: {
    firehose: {
      enabled: false,
    },
  },
  mixpanel: {
    token: '3aee37e9cb8f8f6afc3b52cd5a0c3457',
    verbose: true,
  },
}
