// Test script to verify OTA URL host parsing, allowlist checks, and SHA-256 validation

function parseAndValidateHost(url, allowlistStr) {
  if (!url.startsWith('https://')) {
    return { ok: false, reason: 'Insecure protocol' };
  }

  const hostStart = 8;
  let hostEnd = url.indexOf('/', hostStart);
  const portIndex = url.indexOf(':', hostStart);

  if (portIndex !== -1 && (hostEnd === -1 || portIndex < hostEnd)) {
    hostEnd = portIndex;
  }
  if (hostEnd === -1) {
    hostEnd = url.length;
  }

  const host = url.substring(hostStart, hostEnd).toLowerCase();
  if (host.length === 0) return { ok: false, reason: 'Empty host' };

  const allowedList = allowlistStr.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  const matched = allowedList.some(allowed => host === allowed || host.endsWith('.' + allowed));
  if (!matched) {
    return { ok: false, reason: `Host '${host}' not in allowlist` };
  }

  return { ok: true, host };
}

function validateSha256(hashStr) {
  if (typeof hashStr !== 'string' || hashStr.length !== 64) {
    return false;
  }
  return /^[0-9a-fA-F]{64}$/.test(hashStr);
}

const ALLOWLIST = 'github.com,raw.githubusercontent.com,bwrworks.github.io';

console.log('=== RUNNING OTA SECURITY VALIDATION TESTS ===');

// Test 1: Plain HTTP should be rejected
console.log('Test 1 (HTTP rejection):', parseAndValidateHost('http://github.com/firmware.bin', ALLOWLIST));
if (parseAndValidateHost('http://github.com/firmware.bin', ALLOWLIST).ok === false) {
  console.log('-> PASS: HTTP rejected.');
} else {
  console.error('-> FAIL: HTTP was accepted!');
  process.exit(1);
}

// Test 2: Substring injection attack: https://evil.com/github.com/payload.bin
console.log('Test 2 (Path injection):', parseAndValidateHost('https://evil.com/github.com/payload.bin', ALLOWLIST));
if (parseAndValidateHost('https://evil.com/github.com/payload.bin', ALLOWLIST).ok === false) {
  console.log('-> PASS: Host spoofing in path rejected.');
} else {
  console.error('-> FAIL: Path injection allowed!');
  process.exit(1);
}

// Test 3: Subdomain check (case-insensitive)
console.log('Test 3 (Valid raw.githubusercontent.com):', parseAndValidateHost('https://RAW.githubusercontent.com/user/repo/releases/firmware.bin', ALLOWLIST));
if (parseAndValidateHost('https://RAW.githubusercontent.com/user/repo/releases/firmware.bin', ALLOWLIST).ok === true) {
  console.log('-> PASS: Subdomain matched and lowercased.');
} else {
  console.error('-> FAIL: Valid host rejected!');
  process.exit(1);
}

// Test 4: Mandatory SHA-256 validation
console.log('Test 4 (Missing/short SHA-256):', validateSha256('abc123'));
if (validateSha256('abc123') === false && validateSha256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') === true) {
  console.log('-> PASS: SHA-256 length & hex validation working.');
} else {
  console.error('-> FAIL: SHA-256 validation failed!');
  process.exit(1);
}

console.log('=== ALL OTA SECURITY VALIDATION TESTS PASSED ===');
