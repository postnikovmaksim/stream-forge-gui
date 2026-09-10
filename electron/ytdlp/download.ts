import fs from 'node:fs'
import https from 'node:https'

const MAX_REDIRECTS = 5

export function downloadFile(url: string, destPath: string, redirectsLeft = MAX_REDIRECTS): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'animedl' } }, (response) => {
        const { statusCode, headers } = response

        if (
          statusCode &&
          statusCode >= 300 &&
          statusCode < 400 &&
          headers.location &&
          redirectsLeft > 0
        ) {
          response.resume()
          downloadFile(headers.location, destPath, redirectsLeft - 1).then(resolve, reject)
          return
        }

        if (statusCode !== 200) {
          response.resume()
          reject(new Error(`Не удалось скачать ${url}: HTTP ${statusCode}`))
          return
        }

        const file = fs.createWriteStream(destPath)
        response.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      })
      .on('error', reject)
  })
}
