export default {
  winston: {
    logger: {
      console: {
        level: 'info',
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
  datadog: {
    enabled: false,
  },
  luno: {
    channel: 'C25FGHVCJ',
    listenToChannels: 'G17482L2U'.split(','),
  },
}
