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
import { Upload2Notion } from "Upload2Notion";
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
			"Share to notion",
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
			id: "export-to-notion",
			name: "Export current file to Notion",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.upload()
			},
		});

		// upload files from a folder
		this.addCommand({
			id: "export-folder-to-notion",
			name: "Export files from folder to Notion",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.uploadFolder()
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

	}

	onunload() {}

	async upload(){
		const { notionAPI, databaseID, allowTags } = this.settings;
		if (notionAPI === "" || databaseID === "") {
			new Notice(
				"Please set up the notion API and database ID in the settings tab."
			);
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
			const upload = new Upload2Notion(this);
			const res = await upload.syncMarkdownToNotion(basename, allowTags, tags, markDownData, currentFile, this.app, this.settings);
			if (res.status === 200) {
				new Notice(`${langConfig["sync-success"]}${basename}`);
			} else {
				new Notice(`${langConfig["sync-fail"]}${basename}`, 5000);
			}
		}
	}

	async uploadFolder(){
		const { notionAPI, databaseID, allowTags } = this.settings;
				if (notionAPI === "" || databaseID === "") {
					new Notice(
						"Please set up the notion API and database ID in the settings tab."
					);
					return;
				}

				console.log("asking for the folder")

				let folderPath = new getFolderPath(this.app, (result) => {
					const fileListing = app.vault.getMarkdownFiles().filter(f => f.path.includes(result))
					console.log(fileListing)
					// stopping short of array.length for now
					for (let i = 0; i < 6; i++) {
						console.log(fileListing[i].path)
						this.processMarkdownFile(fileListing[i], allowTags);
					  }  
				}).open();
	}

	async getMarkdownContent(currentFile: TFile) {
		const { allowTags } = this.settings;
		let tags = []
		try {
			if(allowTags) {
				tags = app.metadataCache.getFileCache(currentFile).frontmatter.tags;
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

export class getFolderPath extends Modal {
	result: string;
	onSubmit: (result: string) => void;
  
	constructor(app: App, onSubmit: (result: string) => void) {
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
			this.result = value
		  }));
  
	  new Setting(contentEl)
		.addButton((btn) =>
		  btn
			.setButtonText("Submit")
			.setCta()
			.onClick(() => {
			  this.close();
			  this.onSubmit(this.result);
			}));
	}
  
	onClose() {
	  let { contentEl } = this;
	  contentEl.empty();
	}
  }