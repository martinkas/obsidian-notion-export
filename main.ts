import {
	App,
	DropdownComponent,
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
import { markdownToBlocks,  } from "@tryfabric/martian";
import * as yamlFrontMatter from "yaml-front-matter";
import * as yaml from "yaml"

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

// Obsidian plugin definition with main classes and settings
export default class ObsidianExportNotionPlugin extends Plugin {
	settings: PluginSettings;
	notionDBs: any;
	erroredFiles: { filePath: string; error: string }[] = [];
	
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
				const dbResult = await this.getDatabaseList()
				if (dbResult.length > 0) {
					this.notionDBs = dbResult
				}
				console.log("NotionDB object is: \n")
				console.log(this.notionDBs)
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async appendChildren() {
		const { notionAPI, databaseID } = this.settings;

		const currentFile = app.workspace.getActiveFile();
		const markDownData = await currentFile.vault.read(currentFile);
		const yamlObj:any = yamlFrontMatter.loadFront(markDownData);
		const __content = yamlObj.__content
		const file2Block = markdownToBlocks(__content);
		console.log(file2Block)
		
		const parent = "d045f3f2-0ecc-4372-bca7-639350856b60"

		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		const apiTestInstance = new NotionInteractions(this);
		const res = await apiTestInstance.appendBlocks(parent, file2Block);
		if (res) {
			console.log(res)
		}
	}

	async getDatabaseList(){
		const { notionAPI, databaseID } = this.settings;
		let notionDBInfo = []

		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		// get content for current file
		const apiTestInstance = new NotionInteractions(this);
		const res = await apiTestInstance.getDatabaseList(this.app, this.settings, '');

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
					notionDBInfo.push({
						"title": element.title[0].plain_text,
						"id": element.id,
						"object": element.object,
						"properties": element.properties
					})
				}
			}
		} else {
			// new Notice(`${langConfig["sync-fail"]}${basename}`, 5000);
		}

		return notionDBInfo
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
			if (res && res.status === 200) {
				new Notice(`${langConfig["sync-success"]}${basename}`);
			} else {
				new Notice(`${langConfig["sync-fail"]}${basename}`, 5000);
				this.erroredFiles.push({ filePath: activeFile.path, error: `sync error` });
			}
			if (res) {
				console.log(res)
			}
		}
	}

	private async processFiles(folderPath: string, maxFiles: number, notionDBID: string) {
		const allowTags = this.settings.allowTags;
		const notionAPI = this.settings.notionAPI;
		let databaseID = this.settings.databaseID;
		this.erroredFiles = [] // start with empty error log

		// set the destination DB ID
		console.log("notion DB id is" + notionDBID)
		if (notionDBID !== "") {
			databaseID = notionDBID
			this.settings.databaseID = databaseID
		}

		if (notionAPI === "" || databaseID === "") {
			new Notice(langConfig["settings-missing"]);
			return;
		}

		const fileListing = app.vault.getMarkdownFiles().filter(f => f.path.includes(folderPath))
		console.log(fileListing)

		// stopping short of array.length if a max was defined in settings
		let numberOfFiles = fileListing.length
		if (maxFiles && maxFiles > 0) {
			numberOfFiles = Math.min(maxFiles, fileListing.length)
		} 

		for (let i = 0; i < numberOfFiles; i++) {
			console.log(fileListing[i].path)
			await this.processMarkdownFile(fileListing[i], allowTags);
			// wait for a 0.5 seconds to avoid triggering the rate limiter of the API
			await sleep(500)
		}

		if (this.erroredFiles.length > 0) {
			await this.createErroredFilesReport();
		}
	}

	async uploadFolder(){
		const dbResult = await this.getDatabaseList()
		if (dbResult.length > 0) {
			this.notionDBs = dbResult
		}
		let folderPath, maxFiles, dbID = new getExportSettings(this.app, dbResult, (folderPath, maxFiles, dbId) => this.processFiles(folderPath, maxFiles, dbId)).open();
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

	async createErroredFilesReport(): Promise<void> {
		const title = `Notion export error report`;
		const filePath = `${title}.md`;

		let errorListing = "";

		for (let i = 0; i < this.erroredFiles.length; i++) {
			const element = this.erroredFiles[i];
			
			errorListing += "[[" + element.filePath + "]] - " + element.error + "\n"
		}

		const fileContent = `# ${title}\n\n${errorListing}`;
		await this.app.vault.create(filePath, fileContent);
	}
}

// Obsidian plugin settings, apply to the whole plugin
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

				return t
			});

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

// simple Modal that gets user input for exporting a folder
export class getExportSettings extends Modal {
	folderPath: string; // string used to filter from all folders
	maxFiles: number; // the max number of files that should be exported in case of large folders
	dbId: string; // selected DB ID for actions
	notionDBs: any; // passed in list of available Notion DBs

	onSubmit: (folderPath: string, maxFiles: number, dbId: string) => void;
  
	constructor(app: App, notionDBs: object, onSubmit: (folderPath: string, maxFiles: number, dbId: string) => void) {
	  super(app);
	  this.notionDBs = notionDBs;
	  this.onSubmit = onSubmit;
	}
  
	onOpen() {
		const { contentEl } = this;
	
		contentEl.createEl("h1", { text: "Folder Sync Selection:" });

		const dbSelector = new Setting(contentEl)
		.setName('Notion Database')
		.setDesc('Select the destination database for the page uploads.')
		const dbSelectContainer = contentEl.createDiv()

		let dbSelectorOptions =  new DropdownComponent(dbSelectContainer)
		for (let i = 0; i < this.notionDBs.length; i++) {
			const element = this.notionDBs[i];
			console.log(element)
			dbSelectorOptions.addOption(element.id, element.title)
		}
		dbSelectorOptions.onChange((value) => {
			this.dbId = value;
			console.log(this.dbId)
		});
		// also make sure that the dropdown status is saved without a change
		this.dbId = this.notionDBs[0].id
  
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
				this.onSubmit(this.folderPath, this.maxFiles, this.dbId);
				}));
	}
  
	onClose() {
	  let { contentEl } = this;
	  contentEl.empty();
	}
  }