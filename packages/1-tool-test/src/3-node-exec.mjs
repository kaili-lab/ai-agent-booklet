import { spawn } from 'node:child_process';

// echo 在 windows 可能不支持，可以设置 shell: 'powershell.exe'
const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts';
// cwd(): 返回Nodejs的当前工作目录
const cwd = process.cwd();
// 解析命令和参数
const [cmd, ...args] = command.split(' ');

// spawn 创建的是一个独立子进程，命令执行完后子进程会退出，资源由系统回收
// 子进程创建后，会自动通过stdio读取数据，管道符会将数据写入IO等待读取
const child = spawn(cmd, args, {
  cwd,
  stdio: 'inherit', // 实时输出到控制台
  // shell: true, win系统可以设置 shell: 'powershell.exe'
  // Windows中使用git bash可以执行 Linux 命令
  shell: 'C:Program Files//Git//bin//bash.exe', 
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
