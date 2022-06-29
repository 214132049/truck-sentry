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

function getLocalInfoFormPackage(rootPath: string): LocalInfo | null {
	const labels = ['@truck-sentry/vue', '@truck-sentry/react', '@truck-sentry/browser'];

	for(let i = 0; i < labels.length; i++) {

		const packageJsonPath = path.join(rootPath, 'node_modules', labels[i], 'package.json');

		if (!pathExists(packageJsonPath)) {
			continue;
		}

		const {name, version} = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

		return {version, type: name};
	}

	return null;
}

function getLocalInfoFormLink(rootPath: string): LocalInfo | null {
	const linkPaths = ['index.ejs', 'index.html', 'src/index.ejs', 'src/index.html', 'src/public/index.ejs', 'src/public/index.html'];

	for(let i = 0; i < linkPaths.length; i++) {
		const templatePath = path.join(rootPath, linkPaths[i]);

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


function getLocalVersion(rootPath: string | undefined): LocalInfo | null {

	if (!rootPath) {
		vscode.window.showInformationMessage('No dependency in empty workspace');
		return null;
	}

	let info = getLocalInfoFormLink(rootPath);

	if (!info) {
		info = getLocalInfoFormPackage(rootPath);
	}

	if (!info) {
		channel.appendLine('没有找到@truck-sentry相关内容');
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

		const {version, type} = getLocalVersion(rootPath) || ({} as LocalInfo);

		if (!type) {
			return;
		}

		const ignoreVersions = context.workspaceState.get(storeKey, new Set()) as Set<string>;

		const latestVersion = await getOriginVersion(type);

		if (version === latestVersion || ignoreVersions.has(latestVersion)) {
			return;
		}

		const res = await vscode.window.showInformationMessage(
			`${type} 已发布新版本，您的当前版本:${version}，最新版本:${latestVersion}。`,
			'查看更新',
			'忽略'
		);

		if(!res) {
			return;
		}

		if (res === '忽略') {
			context.workspaceState.update(storeKey, ignoreVersions.add(latestVersion));
			return;
		}

		const uri = 'https://techface.amh-group.com/doc/1504#%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97';

		opn(uri, { app: '' }).catch(() => {
			vscode.window.showErrorMessage('打开浏览器失败，请手动打开:' + uri);
		});
	} catch(e) {
		channel.appendLine((e as Error).message);
	} finally {
		channel.show();
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}
