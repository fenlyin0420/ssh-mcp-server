import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatServerList } from '../build/tools/list-servers.js';

describe('List Servers Tool', () => {
  it('没有配置时应返回友好提示', () => {
    assert.strictEqual(formatServerList([]), 'No SSH servers configured.');
  });

  it('应返回可读摘要和原始 JSON', () => {
    const output = formatServerList([
      {
        name: 'dev',
        host: '192.168.1.100',
        port: 22,
        username: 'root',
        connected: true,
        status: {
          reachable: true,
          hostname: 'dev-box',
          osName: 'Linux',
          lastUpdated: '2026-04-02T12:00:00.000Z'
        }
      }
    ]);

    assert.match(output, /Configured SSH servers:/);
    assert.match(output, /\[connected\] dev \| root@192.168.1.100:22/);
    assert.match(output, /hostname=dev-box/);
    assert.match(output, /Raw JSON:/);
    assert.match(output, /"name": "dev"/);
  });

  it('ad-hoc 连接显示请求的主机名与实际地址', () => {
    const output = formatServerList([
      {
        name: 'adhoc:esc:2222:root',
        host: '14.103.198.148',
        port: 2222,
        username: 'root',
        connected: true,
        adhoc: true,
      },
    ]);

    assert.match(output, /\[connected\] \[adhoc\] esc \| root@14\.103\.198\.148:2222/);
    // 原始 key 仍保留在 JSON 中，便于作为 connectionName 复用
    assert.match(output, /"name": "adhoc:esc:2222:root"/);
  });

  it('可以列出 SSH config 中可用的主机', () => {
    const output = formatServerList(
      [
        {
          name: 'dev',
          host: '192.168.1.100',
          port: 22,
          username: 'root',
          connected: false,
          adhoc: false,
        },
      ],
      { sshConfigHosts: ['esc', 'root@xxfwq'] },
    );

    assert.match(output, /Hosts from the SSH config/);
    assert.match(output, /- esc/);
    assert.match(output, /- root@xxfwq/);
  });

  it('只开 ad-hoc 时不说「没有配置」，直接给出可用主机', () => {
    const output = formatServerList([], { sshConfigHosts: ['root@esc'] });

    assert.doesNotMatch(output, /No SSH servers configured\./);
    assert.doesNotMatch(output, /Raw JSON/);
    assert.match(output, /can be targeted with the 'host' parameter/);
    assert.match(output, /- root@esc/);
  });

  it('没有服务器也没有可用主机时仍返回友好提示', () => {
    assert.strictEqual(formatServerList([], { sshConfigHosts: [] }), 'No SSH servers configured.');
  });
});
