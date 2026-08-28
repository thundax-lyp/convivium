export function createSmokeEnvironment(baseEnvironment, overrides = {}) {
    const environment = { ...baseEnvironment, ...overrides };
    delete environment.DEEPSEEK_API_KEY;
    return environment;
}
