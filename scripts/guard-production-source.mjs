const isProduction = process.env.VERCEL_ENV === 'production'

if (isProduction) {
  const expected = {
    VERCEL_GIT_PROVIDER: 'github',
    VERCEL_GIT_REPO_OWNER: 'shunta115',
    VERCEL_GIT_REPO_SLUG: 'daidougei-haku-app',
    VERCEL_GIT_COMMIT_REF: 'main',
  }

  const invalid = Object.entries(expected).filter(
    ([name, value]) => process.env[name] !== value,
  )
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? ''

  if (invalid.length > 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    const details = invalid
      .map(([name, value]) => `${name} must be ${value}`)
      .concat(/^[0-9a-f]{40}$/i.test(sha) ? [] : ['VERCEL_GIT_COMMIT_SHA must be a full commit SHA'])
      .join('; ')

    throw new Error(
      `Production deployment blocked: deploy the GitHub main branch through the Vercel Git integration. ${details}`,
    )
  }
}
