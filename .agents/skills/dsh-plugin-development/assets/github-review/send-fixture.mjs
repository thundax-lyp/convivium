// Local-only ingress probe. Default action does not match the review rule.
import { createHmac } from 'node:crypto'
import { request } from 'node:http'

const args = new Set(process.argv.slice(2))
if ([...args].some(arg => !['--match', '--bad-signature'].includes(arg))) {
  throw new Error('Usage: node send-fixture.mjs [--match] [--bad-signature]')
}
const secret = process.env.DSH_GITHUB_WEBHOOK_SECRET
const repository = process.env.DSH_GITHUB_REVIEW_REPOSITORY
const port = Number(process.env.DSH_GITHUB_WEBHOOK_PORT ?? 3081)
if (!secret || !repository || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set webhook secret, repository and a valid local port first')
}
const body = Buffer.from(JSON.stringify({
  action: args.has('--match') ? 'ready_for_review' : 'opened',
  repository: { full_name: repository },
  number: 1,
  pull_request: {
    title: 'Local fixture', user: { login: 'fixture' },
    base: { ref: 'main', sha: '0'.repeat(40) },
    head: { ref: 'fixture', sha: '1'.repeat(40) },
  },
}))
const signature = createHmac('sha256', args.has('--bad-signature') ? secret + '-invalid' : secret)
  .update(body).digest('hex')
await new Promise((resolve, reject) => {
  const req = request({
    hostname: '127.0.0.1', port, path: '/github', method: 'POST',
    headers: {
      'content-type': 'application/json', 'content-length': body.length,
      'x-github-event': 'pull_request', 'x-github-delivery': 'local-fixture-delivery',
      'x-hub-signature-256': `sha256=${signature}`,
    },
  }, response => {
    response.resume()
    response.on('error', reject)
    response.on('end', () => {
      console.log(`HTTP ${response.statusCode}; this is ingress acknowledgement, not review completion`)
      const expected = args.has('--bad-signature') ? 401 : 202
      if (response.statusCode !== expected) reject(new Error(`Expected HTTP ${expected}`))
      else resolve()
    })
  })
  req.setTimeout(5000, () => req.destroy(new Error('Local ingress timed out')))
  req.on('error', reject)
  req.end(body)
})
