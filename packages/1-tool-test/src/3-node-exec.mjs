import { spawn } from 'node:child_process';

// echo 在 windows 可能不支持，可以设置 shell: 'powershell.exe'
const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts';
const cwd = process.cwd();
// 解析命令和参数
const [cmd, ...args] = command.split(' ');

const child = spawn(cmd, args, {
  cwd,
  stdio: 'inherit', // 实时输出到控制台
  shell: true,
});

let errorMsg = '';

child.on('error', (error) => {
  errorMsg = error.message;
});

child.on('close', (code) => {
  if (code === 0) {
    process.exit(0);
  } else {
    if (errorMsg) {
      console.error(`错误: ${errorMsg}`);
    }
    process.exit(code || 1);
  }
});
/*
用途:代码中执行 命令行命令
使用场景：
构建工具中执行各种命令：编译、打包、测试
nodeJS程序中执行其他命令行工具，比如git命令
动态执行命令，根据不同情况执行不同命令

四种创建子进程的方式
spawn：
exec
execFile
fork

它们都可以实现：执行命令、执行JS代码
*/
