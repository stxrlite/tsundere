export function test(name, run) {
  Promise.resolve()
    .then(run)
    .then(() => console.log(`ok ${name}`))
    .catch((error) => {
      console.error(`fail ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

export function expect(value) {
  return {
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${String(value)} to be ${String(expected)}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected ${String(value)} to be truthy`);
      }
    }
  };
}

export function mock(fn = () => undefined) {
  const calls = [];
  const mocked = (...args) => {
    calls.push(args);
    return fn(...args);
  };
  mocked.calls = calls;
  return mocked;
}
