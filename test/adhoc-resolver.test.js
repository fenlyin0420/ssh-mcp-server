import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildAdhocKey,
  isHostAllowed,
  parseAdhocKey,
  resolveAdhocTarget,
} from '../build/services/adhoc-resolver.js';
import { ToolError } from '../build/utils/tool-error.js';

describe('Ad-hoc 主机解析', () => {
  let sshConfigDir;
  let sshConfigPath;

  before(() => {
    sshConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-adhoc-'));
    sshConfigPath = path.join(sshConfigDir, 'config');
    fs.writeFileSync(
      sshConfigPath,
      [
        'Host alias-a',
        '  HostName 10.9.9.9',
        '  User aliasuser',
        '  Port 2222',
        '',
        'Host alias-key',
        '  HostName 10.9.9.10',
        '  User root',
        '  IdentityFile ~/.ssh/test_key',
        '',
      ].join('\n'),
    );
  });

  after(() => {
    fs.rmSync(sshConfigDir, { recursive: true, force: true });
  });

  function policy(overrides = {}) {
    return { enabled: true, sshConfigFile: sshConfigPath, ...overrides };
  }

  function basePassword(overrides = {}) {
    return {
      host: '192.168.1.100',
      port: 22,
      username: 'devuser',
      password: 'devpass',
      commandWhitelist: ['^ls( .*)?$'],
      ...overrides,
    };
  }

  describe('目标解析与字段优先级', () => {
    it('模板为未在 SSH config 中的主机回填用户名/端口/凭据', () => {
      const { key, config } = resolveAdhocTarget(
        { host: '10.0.0.5' },
        basePassword(),
        policy({ allowPasswordAuth: true }),
      );

      assert.strictEqual(config.host, '10.0.0.5');
      assert.strictEqual(config.username, 'devuser');
      assert.strictEqual(config.port, 22);
      assert.strictEqual(config.password, 'devpass');
      assert.strictEqual(config.commandWhitelist[0], '^ls( .*)?$');
      assert.strictEqual(key, 'adhoc:10.0.0.5:22:devuser');
    });

    it('SSH config 别名提供 HostName/User/Port/IdentityFile', () => {
      const { key, config } = resolveAdhocTarget(
        { host: 'alias-a' },
        basePassword(),
        policy({ allowPasswordAuth: true }),
      );

      assert.strictEqual(config.host, '10.9.9.9');
      assert.strictEqual(config.username, 'aliasuser');
      assert.strictEqual(config.port, 2222);
      // key 用调用方请求的主机名，便于在 list-servers 中辨认
      assert.strictEqual(key, 'adhoc:alias-a:2222:aliasuser');
    });

    it('SSH config 的 IdentityFile 优先于模板私钥', () => {
      const { config } = resolveAdhocTarget(
        { host: 'alias-key' },
        basePassword({ privateKey: 'C:/keys/template_key' }),
        policy(),
      );

      assert.match(config.privateKey, /test_key$/);
      assert.strictEqual(config.password, undefined);
    });

    it('显式参数优先于 SSH config', () => {
      const { config } = resolveAdhocTarget(
        { host: 'alias-a', port: 2200, username: 'explicit' },
        basePassword(),
        policy({ allowPasswordAuth: true }),
      );

      assert.strictEqual(config.port, 2200);
      assert.strictEqual(config.username, 'explicit');
      assert.strictEqual(config.host, '10.9.9.9');
    });
  });

  describe('主机允许名单', () => {
    it('按解析后的地址匹配：别名解析到不允许的地址时拒绝', () => {
      assert.throws(
        () =>
          resolveAdhocTarget(
            { host: 'alias-a' },
            basePassword(),
            policy({ hostPatterns: ['alias-a'], allowPasswordAuth: true }),
          ),
        (error) => {
          assert.ok(error instanceof ToolError);
          assert.strictEqual(error.code, 'ADHOC_HOST_NOT_ALLOWED');
          assert.match(error.message, /10\.9\.9\.9/);
          return true;
        },
      );
    });

    it('通配模式匹配解析后的地址', () => {
      const { config } = resolveAdhocTarget(
        { host: 'alias-a' },
        basePassword(),
        policy({ hostPatterns: ['10.9.*'], allowPasswordAuth: true }),
      );

      assert.strictEqual(config.host, '10.9.9.9');
    });

    it('否定模式优先', () => {
      assert.strictEqual(isHostAllowed('10.9.9.9', ['*', '!10.9.*']), false);
      assert.strictEqual(isHostAllowed('10.0.0.5', ['*', '!10.9.*']), true);
      // 只有否定模式时，未被否定即放行
      assert.strictEqual(isHostAllowed('10.0.0.5', ['!10.9.*']), true);
      assert.strictEqual(isHostAllowed('anything', []), true);
      assert.strictEqual(isHostAllowed('anything', undefined), true);
    });
  });

  describe('凭据边界', () => {
    it('默认不继承密码，并提示开启开关', () => {
      assert.throws(
        () => resolveAdhocTarget({ host: '10.0.0.5' }, basePassword(), policy()),
        (error) => {
          assert.ok(error instanceof ToolError);
          assert.strictEqual(error.code, 'SSH_AUTHENTICATION_MISSING');
          assert.match(error.message, /--adhoc-allow-password-auth/);
          return true;
        },
      );
    });

    it('开启 --adhoc-allow-password-auth 后继承密码与键盘交互认证', () => {
      const { config } = resolveAdhocTarget(
        { host: '10.0.0.5' },
        basePassword({ tryKeyboard: true }),
        policy({ allowPasswordAuth: true }),
      );

      assert.strictEqual(config.password, 'devpass');
      assert.strictEqual(config.tryKeyboard, true);
    });

    it('默认剥离键盘交互认证（仅密码认证的 2FA 场景同样受控）', () => {
      const { config } = resolveAdhocTarget(
        { host: '10.0.0.5' },
        basePassword({ tryKeyboard: true, privateKey: 'C:/keys/template_key' }),
        policy(),
      );

      assert.strictEqual(config.tryKeyboard, undefined);
      assert.strictEqual(config.password, undefined);
      assert.match(config.privateKey, /template_key$/);
    });

    it('无任何可用凭据时给出配置指引', () => {
      assert.throws(
        () =>
          resolveAdhocTarget(
            { host: '10.0.0.5' },
            { username: 'root' },
            policy(),
          ),
        (error) => {
          assert.strictEqual(error.code, 'SSH_AUTHENTICATION_MISSING');
          assert.match(error.message, /~\/\.ssh\/config/);
          return true;
        },
      );
    });
  });

  describe('参数校验', () => {
    it('缺少用户名时报错并给出指引', () => {
      assert.throws(
        () =>
          resolveAdhocTarget(
            { host: '10.0.0.5' },
            { password: 'pw' },
            policy({ allowPasswordAuth: true }),
          ),
        (error) => {
          assert.strictEqual(error.code, 'ADHOC_TARGET_INVALID');
          assert.match(error.message, /username/i);
          return true;
        },
      );
    });

    it('拒绝 user@host 与 host:port 形态', () => {
      for (const host of ['root@10.0.0.5', '10.0.0.5:22', 'a b']) {
        assert.throws(
          () =>
            resolveAdhocTarget(
              { host },
              basePassword(),
              policy({ allowPasswordAuth: true }),
            ),
          (error) => {
            assert.strictEqual(error.code, 'ADHOC_TARGET_INVALID');
            return true;
          },
          `host ${host} 应被拒绝`,
        );
      }
    });

    it('拒绝非法端口', () => {
      assert.throws(
        () =>
          resolveAdhocTarget(
            { host: '10.0.0.5', port: 70000 },
            basePassword(),
            policy({ allowPasswordAuth: true }),
          ),
        (error) => {
          assert.strictEqual(error.code, 'ADHOC_TARGET_INVALID');
          return true;
        },
      );
    });

    it('SSH config 文件不存在时报错', () => {
      assert.throws(
        () =>
          resolveAdhocTarget(
            { host: '10.0.0.5' },
            basePassword(),
            { enabled: true, sshConfigFile: path.join(sshConfigDir, 'missing') },
          ),
        (error) => {
          assert.strictEqual(error.code, 'ADHOC_TARGET_INVALID');
          return true;
        },
      );
    });
  });

  describe('连接 key', () => {
    it('buildAdhocKey 与 parseAdhocKey 可往返，含 IPv6', () => {
      const key = buildAdhocKey('esc', 22, 'root');
      assert.strictEqual(key, 'adhoc:esc:22:root');

      const parts = parseAdhocKey(key);
      assert.deepStrictEqual(parts, {
        requestedHost: 'esc',
        port: 22,
        username: 'root',
      });

      const v6 = buildAdhocKey('2001:db8::1', 2222, 'root');
      assert.deepStrictEqual(parseAdhocKey(v6), {
        requestedHost: '2001:db8::1',
        port: 2222,
        username: 'root',
      });
    });

    it('非 ad-hoc key 返回 null', () => {
      assert.strictEqual(parseAdhocKey('dev'), null);
    });

    it('大小写不同的拼写不共用连接（别名匹配大小写敏感）', () => {
      // 小写命中别名并解析到 HostName，大写不命中，两者目标不同 → key 必须不同
      const lower = resolveAdhocTarget(
        { host: 'alias-a' },
        basePassword(),
        policy({ allowPasswordAuth: true }),
      );
      const upper = resolveAdhocTarget(
        { host: 'ALIAS-A' },
        basePassword(),
        policy({ allowPasswordAuth: true }),
      );

      assert.strictEqual(lower.config.host, '10.9.9.9');
      assert.strictEqual(upper.config.host, 'ALIAS-A');
      assert.notStrictEqual(lower.key, upper.key);
    });

    it('主机允许名单同样大小写敏感', () => {
      assert.strictEqual(isHostAllowed('esc', ['esc']), true);
      assert.strictEqual(isHostAllowed('ESC', ['esc']), false);
      assert.strictEqual(isHostAllowed('ESC', ['ESC']), true);
    });
  });
});
