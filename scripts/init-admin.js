'use strict';

// CLI khởi tạo tài khoản Admin cục bộ vào data/admin.json (thư mục data/ đã được gitignore).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');

const dataDir = path.resolve(process.env.VIETPHUC_DATA_DIR || path.join(__dirname, '..', 'data'));
const adminPath = path.join(dataDir, 'admin.json');

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const username = (await rl.question('Nhập tên đăng nhập Admin: ')).trim();
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
      throw new Error('Tên đăng nhập phải dài 3-50 ký tự (chữ, số, _, ., -).');
    }

    const password = await rl.question('Nhập mật khẩu Admin (tối thiểu 8 ký tự): ');
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');

    fs.mkdirSync(dataDir, { recursive: true });
    const temp = path.join(dataDir, `.admin-${process.pid}-${Date.now()}.tmp`);
    const payload = {
      username,
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, adminPath);
    console.log(`Đã khởi tạo tài khoản Admin "${username}" tại ${adminPath}`);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('Lỗi:', err.message);
  process.exitCode = 1;
});
