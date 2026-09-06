#!/usr/bin/env node

/**
 * 测试运行器
 * 使用 Node.js 内置的测试框架运行所有测试
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

console.log('🧪 运行测试...\n');

// pathname 在 Windows 上会带前导斜杠（/D:/...），需用 fileURLToPath 转换
const root = fileURLToPath(new URL('..', import.meta.url));

try {
  execSync('node scripts/build.js', {
    stdio: 'inherit',
    cwd: root
  });
  execSync('node --test test/**/*.test.js', {
    stdio: 'inherit',
    cwd: root
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
