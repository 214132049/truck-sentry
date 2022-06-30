import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
const opn = require('opn');

type LocalInfo = {
	version: string,
	type: string
};

const storeKey = '__truck_sentry_ignore_version__';

const channel = vscode.window.createOutputChannel('TruckSentry');

function pathExists(p: string): boolean {
	try {
		fs.accessSync(p);
	} catch (err) {
		return false;
	}
	return true;
}

function getConfig() {
	const config = vscode.workspace.getConfiguration('truck-sentry');
	return config || {};
}

function string2Array(str: string) {
	return str.split(';').map(v => v.trim()).filter(Boolean);
}

function getLocalInfoFormPackage(rootPath: string): LocalInfo | null {
	const labels = ['@truck-sentry/vue', '@truck-sentry/react', '@truck-sentry/browser'];

	for(let i = 0; i < labels.length; i++) {

		const packageJsonPath = path.join(rootPath, 'node_modules', labels[i], 'package.json');

		channel.appendLine(`正从文件${packageJsonPath}获取版本`);

		if (!pathExists(packageJsonPath)) {
			continue;
		}

		const {name, version} = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

		return {version, type: name};
	}

	return null;
}

function getLocalInfoFormLink(rootPath: string): LocalInfo | null {
	const defaultPath = ['', 'src/', 'public/'];
	const defaultName = ['index.ejs', 'index.tpl', 'index.html'];

	const {name: _name, path: _path} = getConfig();
	
	const finalPath = _path ? string2Array(_path) : defaultPath;
	const finalName = _name ? string2Array(_name) :defaultName;

	const linkPaths = finalPath.map((path: string) => finalName.map((name: string) => path + name)).flat();

	for(let i = 0; i < linkPaths.length; i++) {

		const templatePath = path.join(rootPath, linkPaths[i]);

		channel.appendLine(`正从文件${templatePath}获取版本`);

		if (!pathExists(templatePath)) {
			continue;
		}
		
		const template = fs.readFileSync(templatePath, 'utf-8');

		const match = template.match(/@truck-sentry\/(.+)(?=\/bundle)/);

		if (!match) {
			break;
		}

		const [module, name, version] = match[0].split('/');

		return {
			version: version.replace('v', ''),
			type: [module, name].join('/')
		};
	}
	return null;
}


function getLocalVersion(rootPath: string | undefined): LocalInfo {

	if (!rootPath) {
		throw new Error('根路径不存在');
	}

	let info = getLocalInfoFormLink(rootPath);

	if (!info) {
		info = getLocalInfoFormPackage(rootPath);
	}

	if (!info) {
		throw new Error('没有找到@truck-sentry相关内容');
	}

	return info;
}

function getOriginVersion(type: string): Promise<string> {
	const uri = 'https://npm.amh-group.com/-/verdaccio/data/sidebar/' + type;
	return axios.get(uri).then(({data}) => data?.latest?.version);
}

export async function activate(context: vscode.ExtensionContext) {
	try {
		const folders = vscode.workspace.workspaceFolders;

		const rootPath = folders && folders.length > 0 ? folders[0].uri.fsPath: undefined;

		const {version, type} = getLocalVersion(rootPath);

		channel.appendLine(`当前版本:${version}`);

		const latestVersion = await getOriginVersion(type);

		channel.appendLine(`最新版本:${latestVersion}`);

		const ignoreVersions = context.workspaceState.get(storeKey, []) as Array<string>;

		channel.appendLine(`已跳过的版本:${JSON.stringify(ignoreVersions)}`);
		
		if (version === latestVersion || ignoreVersions.includes(latestVersion)) {
			return;
		}

		const res = await vscode.window.showInformationMessage(
			`${type} 已发布新版本，您的当前版本:${version}，最新版本:${latestVersion}。`,
			'查看更新',
			'跳过此版本'
		);

		if(!res) {
			return;
		}

		if (res === '跳过此版本') {
			context.workspaceState.update(storeKey, ignoreVersions.concat(latestVersion));
			return;
		}

		const uri = 'https://techface.amh-group.com/doc/1504#%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97';

		opn(uri, { app: '' }).catch(() => {
			vscode.window.showErrorMessage('打开浏览器失败，请手动打开:' + uri);
		});
	} catch(e) {
		channel.appendLine((e as Error).message);
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}
