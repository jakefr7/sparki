import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const DEFAULT_WEB_PORT = '3001';
const selectedPort = process.env.WEB_PORT || process.env.PORT || DEFAULT_WEB_PORT;
const allowPort3000 = process.env.SPARKI_ALLOW_PORT_3000 === 'true';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertPortValue(port) {
  if (!/^\d+$/.test(port)) {
    fail(`Invalid Sparki web port "${port}". Set WEB_PORT to a numeric port.`);
  }
}

function assertSafePort(port) {
  if (port === '3000' && !allowPort3000) {
    fail(
      'Sparki cannot run on port 3000 by default because it conflicts with CRO local auth/consent login.\n' +
        'Use WEB_PORT=3001 for Sparki, or set SPARKI_ALLOW_PORT_3000=true only when you are sure.',
    );
  }
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Sparki web port ${port} is already in use. Choose another WEB_PORT; this script will not fall back to port 3000.`,
          ),
        );
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      server.close(resolve);
    });

    // Local development does not need an all-interface listener. Binding the
    // probe explicitly to loopback also works in restricted environments
    // where listening on 0.0.0.0 is denied with EPERM.
    server.listen(Number(port), '127.0.0.1');
  });
}

assertPortValue(selectedPort);
assertSafePort(selectedPort);

try {
  await assertPortAvailable(selectedPort);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(`Sparki web dev starting at http://localhost:${selectedPort}`);

const child = spawn('next', ['dev', '--hostname', '127.0.0.1', '--port', selectedPort], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    WEB_PORT: selectedPort,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
