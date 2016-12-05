import dogapi from 'dogapi'

import config from './config/environment'

dogapi.initialize({
  api_key: config.datadog.apiKey,
  app_key: config.datadog.appKey,
})

export default dogapi
