import { Notice, requestUrl, TFile, normalizePath, App } from "obsidian";
import { Client } from "@notionhq/client";
import { markdownToBlocks,  } from "@tryfabric/martian";
import * as yamlFrontMatter from "yaml-front-matter";
import * as yaml from "yaml"
import MyPlugin from "main";
export class NotionInteractions {
	app: MyPlugin;
	notion: Client;
	agent: any;
	constructor(app: MyPlugin) {
		this.app = app;
	}

	async getDatabaseList(app:App, settings:any, filter: string){
		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/search`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2022-06-28',
				},
				body: JSON.stringify({
					"filter": {
						"value": "database",
						"property": "object"
					}
				})
			})
			console.log(response)
			return response;
		} catch (error) {
			console.log(error)
			new Notice(`network error ${error}`)
		}
	}

	async queryDatabase(app:App, settings:any, filter: string){
		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/databases/${this.app.settings.databaseID}/query`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2022-06-28',
				},
				// body should containt the filter
				body: filter
			})
			console.log(response)
			return response;
		} catch (error) {
			console.log(error)
			new Notice(`network error ${error}`)
		}
	}

	async getDatabase(app:App, settings:any){
		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/databases/${this.app.settings.databaseID}`,
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2022-06-28',
				},
				body: ''
			})
			console.log(response)
			return response;
		} catch (error) {
			console.log(error)
			new Notice(`network error ${error}`)
		}
	}

	async deletePage(notionID:string){
		const response = await requestUrl({
			url: `https://api.notion.com/v1/blocks/${notionID}`,
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer ' + this.app.settings.notionAPI,
				'Notion-Version': '2022-06-28',
			},
			body: ''
		})
		return response;
	}

	// update page
	async updatePage(notionID:string, title:string, allowTags:boolean, tags:string[], childArr:any) {
		await this.deletePage(notionID)
		const res = await this.createPage(title, allowTags, tags, childArr)
		return res
	}

	async createPage(title:string, allowTags:boolean, tags:string[], childArr: any) {
		// Initializing a client
		const notion = new Client({
			auth: this.app.settings.notionAPI,
		})

		const bodyString:any = {
			parent: {
				database_id: this.app.settings.databaseID
			},
			properties: {
				Name: {
					title: [
						{
							text: {
								content: title,
							},
						},
					],
				},
				Tags: {
					multi_select: allowTags && tags !== undefined ? tags.map(tag => {
						return {"name": tag}
					}) : [],
				},
			},
			children: childArr,
		}

		if(this.app.settings.bannerUrl) {
			bodyString.cover = {
				type: "external",
				external: {
					url: this.app.settings.bannerUrl
				}
			}
		}

		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/pages`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2022-06-28',
				},
				body: JSON.stringify(bodyString),
			})
			console.log(response)
			return response;
		} catch (error) {
				new Notice(`network error ${error}`)
		}
	}

	async syncMarkdownToNotion(title:string, allowTags:boolean, tags:string[], markdown: string, nowFile: TFile, app:App, settings:any): Promise<any> {
		let res:any
		const yamlObj:any = yamlFrontMatter.loadFront(markdown);
		const __content = yamlObj.__content
		const file2Block = markdownToBlocks(__content);
		const frontmasster =await app.metadataCache.getFileCache(nowFile)?.frontmatter
		const notionID = frontmasster ? frontmasster.notionID : null
		
		const limits = new checkBlockLimits(file2Block)
		console.log("Max child depth: ", limits.maxChildDepth)
		console.log("Overall block length: ", limits.blockLength)

		if(notionID){
				res = await this.updatePage(notionID, title, allowTags, tags, file2Block);
		} else {
			 	res = await this.createPage(title, allowTags, tags, file2Block);
		}
		console.log(res)
		if (res && res.status === 200) {
			await this.updateYamlInfo(markdown, nowFile, res, app, settings)
		} else {
			new Notice(`Sync error with current page`)
		}
		return res
	}

	async updateYamlInfo(yamlContent: string, nowFile: TFile, res: any,app:App, settings:any) {
		const yamlObj:any = yamlFrontMatter.loadFront(yamlContent);
		let {url, id} = res.json
		// replace www to notionID
		const {notionID} = settings;
		if(notionID!=="") {
			// replace url str "www" to notionID
			url  = url.replace("www.notion.so", `${notionID}.notion.site`)
		}
		yamlObj.link = url;
		try {
			await navigator.clipboard.writeText(url)
		} catch (error) {
			new Notice(`复制链接失败，请手动复制${error}`)
		}
		yamlObj.notionID = id;
		const __content = yamlObj.__content;
		delete yamlObj.__content
		const yamlhead = yaml.stringify(yamlObj)
		//  if yamlhead hava last \n  remove it
		const yamlhead_remove_n = yamlhead.replace(/\n$/, '')
		// if __content have start \n remove it
		const __content_remove_n = __content.replace(/^\n/, '')
		const content = '---\n' +yamlhead_remove_n +'\n---\n' + __content_remove_n;
		try {
			await nowFile.vault.modify(nowFile, content)
		} catch (error) {
			new Notice(`write file error ${error}`)
		}
	}
}

class checkBlockLimits {
	maxChildDepth: number
	blockLength: number
	blocks: any

	constructor(blocks: any) {
		this.blocks = blocks,
		this.maxChildDepth = 0,
		this.blockLength = 0

		console.log("Processing the blocks for the curent page:\n", this.blocks)
		this.iterateBlocks(this.blocks, 0)
	}

	public iterateBlocks (blocks: any, childDepth: number) {
		const currentKeys = Object.keys(blocks)
		var currentMaxChildDepth = childDepth

		console.log("starting to iterate over blocks", currentKeys)
		currentKeys.forEach(key => {
			if (key == 'object' && blocks[key] == 'block') {
				this.blockLength++;
			}

			if (key == 'children' && blocks[key] !== undefined) {
				currentMaxChildDepth++;
				if (currentMaxChildDepth > this.maxChildDepth) {
					this.maxChildDepth = currentMaxChildDepth
				}
			}
			console.log(`key: ${key}, value: ${blocks[key]}`)
		
			if (typeof blocks[key] === 'object' && blocks[key] !== null) {
				this.iterateBlocks(blocks[key], currentMaxChildDepth)
			}
		})
	}
}