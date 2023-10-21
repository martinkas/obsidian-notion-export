import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath
} from "obsidian";
import {addIcons}  from 'icon';
import { NotionInteractions } from "NotionInteractions";
import {NoticeMConfig} from "Message";
import { CLIENT_RENEG_LIMIT } from "tls";


// Remember to rename these classes and interfaces!

interface PluginSettings {
	notionAPI: string;
	databaseID: string;
	bannerUrl: string;
	notionID: string;
	proxy: string;
	allowTags: boolean;
}

const langConfig =  NoticeMConfig( window.localStorage.getItem('language') || 'en')

const DEFAULT_SETTINGS: PluginSettings = {
	notionAPI: "",
	databaseID: "",
	bannerUrl: "",
	notionID: "",
	proxy: "",
	allowTags: false
};

export default class ObsidianExportNotionPlugin extends Plugin {
	settings: PluginSettings;
	async onload() {
		await this.loadSettings();
		addIcons();
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"notion-logo",
			"NotionSync - Share Current Page",
			async (evt: MouseEvent) => {
				// Called when the user clicks the icon.
				this.upload();
			}
		);

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText("share to notion");

		// upload current files
		this.addCommand({
			id: "notionsync-export-current",
			name: "NotionSync - Sync current page to Notion",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.upload()
			},
		});

		// upload files from a folder
		this.addCommand({
			id: "notionsync-export-folder",
			name: "NotionSync - Sync files from a folder to Notion",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.uploadFolder()
			},
		});

		// test command to try out the Notion API
		this.addCommand({
			id: "notionsync-api-test",
			name: "NotionSync - test an API call",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.apiTest()
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async apiTest(){
		const { notionAPI, databaseID } = this.settings;
		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		// get content for current file
		const apiTestInstance = new NotionInteractions(this);
		const res = await apiTestInstance.getDatabaseList(this.app, this.settings, '');
		if (res) {
			console.log(res)
		}
		if (res && res.status === 200) {
			console.log(res.json)
			// display the title of a Database
			// console.log(res.json.title[0].text.content)

			// now list all pages in the database
			// TODO
			// need to loop through pagination
			// const pages = res.json.results
			// for (let i = 0; i < pages.length; i++) {
			// 	const element = pages[i];
			// 	console.log(element.properties.Name.title[0].plain_text)
			// }
			const databases = res.json.results
			for (let i = 0; i < databases.length; i++) {
				const element = databases[i];
				// only list the DBs that are not inline (although not sure what inline is)
				if (element.is_inline === false) {
					console.log(element.title[0].plain_text)
				}
			}
		} else {
			// new Notice(`${langConfig["sync-fail"]}${basename}`, 5000);
		}
	}

	async upload(){
		const { notionAPI, databaseID, allowTags } = this.settings;
		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		// get content for current file
		const activeFile = app.workspace.getActiveFile();
		await this.processMarkdownFile(activeFile, allowTags);
	}

	private async processMarkdownFile(activeFile: TFile, allowTags: boolean) {
		const { markDownData, currentFile, tags } = await this.getMarkdownContent(activeFile);

		if (markDownData) {
			const { basename } = currentFile;
			const upload = new NotionInteractions(this);
			const res = await upload.syncMarkdownToNotion(basename, allowTags, tags, markDownData, currentFile, this.app, this.settings);
			if (res.status === 200) {
				new Notice(`${langConfig["sync-success"]}${basename}`);
			} else {
				new Notice(`${langConfig["sync-fail"]}${basename}`, 5000);
			}
		}
	}

	private async processFiles(folderPath: string, maxFiles: number) {
		const { notionAPI, databaseID, allowTags } = this.settings;
		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		const fileListing = app.vault.getMarkdownFiles().filter(f => f.path.includes(folderPath))
		console.log(fileListing)

		// stopping short of array.length for now
		for (let i = 0; i < maxFiles; i++) {
			console.log(fileListing[i].path)
			await this.processMarkdownFile(fileListing[i], allowTags);
			// wait for a 0.5 seconds to avoid triggering the rate limiter of the API
			await sleep(500)
		}
	}

	async uploadFolder(){
		let folderPath = new getExportSettings(this.app, (folderPath, maxFiles) => this.processFiles(folderPath, maxFiles)).open();
	}

	async getMarkdownContent(currentFile: TFile) {
		const { allowTags } = this.settings;
		let tags = []
		try {
			if(allowTags) {
				tags = app.metadataCache.getFileCache(currentFile).frontmatter.tags;
				console.log(tags)
			}
		} catch (error) {
			new Notice(langConfig["set-tags-fail"]);
		}
		if (currentFile) {
			const markDownData = await currentFile.vault.read(currentFile);
			return {
				markDownData,
				currentFile,
				tags
			};
		} else {
			new Notice(langConfig["open-file"]);
			return;
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: ObsidianExportNotionPlugin;

	constructor(app: App, plugin: ObsidianExportNotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Settings for the Obsidian to Notion export plugn",
		});

		new Setting(containerEl)
			.setName("Notion API Token")
			.setDesc("Get from Notion Developer Settings")
			.addText((text) =>{
				let t = text
				.setPlaceholder("Enter your Notion API Token")
				.setValue(this.plugin.settings.notionAPI)
				.onChange(async (value) => {
					this.plugin.settings.notionAPI = value;
					await this.plugin.saveSettings();
				})
				// t.inputEl.type = 'password'
				return t
			});


		const notionDatabaseID = new Setting(containerEl)
			.setName("Database ID")
			.setDesc("32 digits from URL")
			.addText((text) => {
				let t = text
				.setPlaceholder("Enter your Database ID")
				.setValue(this.plugin.settings.databaseID)
				.onChange(async (value) => {
					this.plugin.settings.databaseID = value;
					await this.plugin.saveSettings();
				})
				// t.inputEl.type = 'password'
				return t
			}

			);

			// notionDatabaseID.controlEl.querySelector('input').type='password'

			new Setting(containerEl)
			.setName("Banner url(optional)")
			.setDesc("page banner url(optional), default is empty, if you want to show a banner, please enter the url(like:https://raw.githubusercontent.com/EasyChris/obsidian-to-notion/ae7a9ac6cf427f3ca338a409ce6967ced9506f12/doc/2.png)")
			.addText((text) =>
				text
					.setPlaceholder("Enter banner pic url: ")
					.setValue(this.plugin.settings.bannerUrl)
					.onChange(async (value) => {
						this.plugin.settings.bannerUrl = value;
						await this.plugin.saveSettings();
					})
			);


			new Setting(containerEl)
			.setName("Notion ID(optional)")
			.setDesc("Your notion from https://username.notion.site/ Your notion id is the [username]")
			.addText((text) =>
				text
					.setPlaceholder("Enter notion ID(optional) ")
					.setValue(this.plugin.settings.notionID)
					.onChange(async (value) => {
						this.plugin.settings.notionID = value;
						await this.plugin.saveSettings();
					})
			);


			new Setting(containerEl)
			.setName("Convert tags (optional)")
			.setDesc("Transfer the Obsidian tags to the Notion table. Destination table needs a column with the name 'Tags'")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowTags)
					.onChange(async (value) => {
						this.plugin.settings.allowTags = value;
						await this.plugin.saveSettings();
					})
			);

	}
}

export class getExportSettings extends Modal {
	folderPath: string;
	maxFiles: number;

	onSubmit: (folderPath: string, maxFiles: number) => void;
  
	constructor(app: App, onSubmit: (folderPath: string, maxFiles: number) => void) {
	  super(app);
	  this.onSubmit = onSubmit;
	}
  
	onOpen() {
		const { contentEl } = this;
	
		contentEl.createEl("h1", { text: "Path to files to include:" });
  
		new Setting(contentEl)
			.setName("ExportFolderPath")
			.addText((text) =>
			text.onChange((value) => {
				this.folderPath = value
			}));
  
		new Setting(contentEl)
			.setName("ExportMaxFiles")
			.addText((text) =>
			text.onChange((value) => {
				this.maxFiles = parseInt(value)
			}));

		new Setting(contentEl)
			.addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
				this.close();
				this.onSubmit(this.folderPath, this.maxFiles);
				}));
	}
  
	onClose() {
	  let { contentEl } = this;
	  contentEl.empty();
	}
  }