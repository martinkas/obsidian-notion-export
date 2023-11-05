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

	markdownToBlocksOptions = {
		notionLimits: {
		  truncate: false,
		},
	};

	public formatNotionProperty(yamlFontMatter: any) {
		let notionObject: {id: string; content: object;}[] = []
		const hrefDefault:object = null
		const linkDefault:object = null

		for (const key in yamlFontMatter){
			// Get the indexed item by the key:
			const value = yamlFontMatter[key];
			console.log("Key: "+key+" Value: "+typeof value)

			//skip over certain values
			switch (key) {
				case "__content": // has the main content of the page
					break;
				case "link": // internal link to the created notion page
					break;
				case "notionID": // internal notion id
					break;
				case "title": // there can be only 1 title property, and we are already using it
					break;
				case "url":
					if (typeof value == "string") {
						notionObject.push({"id": key, "content" :{"url": value}})
					}
					break;
			
				default:
					// now going by object type for generic values
					// not ideal as a nested switch
					switch (typeof value) {
						case "string":
							let richText = {
								"rich_text" : [
									{
										"type": "text",
										"text": {
											"content": value,
											"link": linkDefault
										},
										"annotations": {
											"bold": false,
											"italic": false,
											"strikethrough": false,
											"underline": false,
											"code": false,
											"color": "default"
										},
										"plain_text": value,
										"href": hrefDefault
									}
								]
							}
							
							notionObject.push({"id": key, "content" :richText})
							break;
						
						case "number":
							let propNumber = {
								"number": value
							}
							notionObject.push({"id": key, "content" :propNumber})
							break;

						default:
							break;
					} // end secondary switch

					// break statement for primary switch
					break;
			}
		}

		return notionObject
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
	async updatePage(notionID:string, title:string, allowTags:boolean, tags:string[], childArr:any, pageProperties: any) {
		await this.deletePage(notionID)
		const res = await this.createPage(title, allowTags, tags, childArr, pageProperties)
		return res
	}

	// add blocks to other blocks, a page, or a database
	// parent: string ID of the parent page/block etc
	// childArr: content object of what needs to get attached
	async appendBlocks(parent: string, content: any) {
		// Initializing a client
		const notion = new Client({
			auth: this.app.settings.notionAPI,
		})
		let remainingContent:any = [] // will use this to hold the content that can't fit into the initial submission

		if (content.length > 99) {
			let totalBlock: any // will hold the full Block
			totalBlock = content
			content = totalBlock.slice(0, 99)
			remainingContent = totalBlock.slice(99, totalBlock.length)
		}

		const body = '{"children": ' + JSON.stringify(content) + '}'

		try {
			let response = await requestUrl({
				url: `https://api.notion.com/v1/blocks/` + parent + '/children',
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2022-06-28',
				},
				body: body,
			})

			// if there is more content to udpate, call the function again
			if (remainingContent.length > 0) {
				response = await this.appendBlocks(parent, remainingContent)
			}

			return response;
		} catch (error) {
				new Notice(`network error ${error}`)
		}
	}


	async createPage(title:string, allowTags:boolean, tags:string[], childArr: any, pageProperties: any) {
		// Initializing a client
		const notion = new Client({
			auth: this.app.settings.notionAPI,
		})

		let bodyString:any = {
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

		// add additional page properties
		if (pageProperties) {
			for (const key in pageProperties){
				// Get the indexed item by the key
				const propName = pageProperties[key].id;
				const value = pageProperties[key].content;

				bodyString.properties[propName] = value

				// take any image frontmatter and use it
				if(propName == "image" && value !== "") {
					bodyString.cover = {
						type: "external",
						external: {
							url: value.rich_text[0].plain_text
						}
					}
					bodyString.icon = {
						type: "external",
						external: {
							url: value.rich_text[0].plain_text
						}
					}
				}
			}
		}

		console.log("bodystring is:\n")
		console.log(JSON.stringify(bodyString))

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
			return response;
		} catch (error) {
			console.log(error)
			new Notice(`network error ${error}`)
		}
	}

	async syncMarkdownToNotion(title:string, allowTags:boolean, tags:string[], markdown: string, nowFile: TFile, app:App, settings:any): Promise<any> {
		let res:any // will hold the result object
		const yamlObj:any = yamlFrontMatter.loadFront(markdown); // initaite the YAML object
		const __content = yamlObj.__content // get the content markdown
		let file2Block = markdownToBlocks(__content, this.markdownToBlocksOptions); // turn markdown content into Notion blocks
		const frontMatter =await app.metadataCache.getFileCache(nowFile)?.frontmatter; // get frontmatter from current file
		console.log(frontMatter)
		// If the file was uploaded before it will have the NotionID added in the frontmatter
		const notionID = frontMatter ? frontMatter.notionID : null; // check if the current file already has a notionID
		let remainingContent:any = [] // will use this to hold the content that can't fit into the initial submission
		
		// check if we are exceeding any of the API limits
		const limits = new checkAPILimits(file2Block)
		console.log("Max child depth: ", limits.maxChildDepth)
		console.log("Overall block length: ", limits.blockLength)
		if (limits.maxChildDepth > 2) {
			// need to break up the block submissions into initial submission and updates to work around limits
			console.log('exceeded API limits on child depth, max depth is', limits.maxChildDepth)
			return false
		}
		if (file2Block.length > 99) {
			let totalBlock: any // will hold the full Block
			totalBlock = file2Block
			file2Block = totalBlock.slice(0, 99)
			remainingContent = totalBlock.slice(99, totalBlock.length)
		}

		// process the frontmatter into Notion page propteries
		const currentProperties = this.formatNotionProperty(yamlObj)
		console.log(currentProperties)

		if(notionID){
				res = await this.updatePage(notionID, title, allowTags, tags, file2Block, currentProperties);
		} else {
			 	res = await this.createPage(title, allowTags, tags, file2Block, currentProperties);
		}

		if (res && res.status === 200) {
			await this.updateYamlInfo(markdown, nowFile, res, app, settings)

			if (remainingContent.length > 0) {
				const pageID:string = res.json.id
				await this.appendBlocks(pageID, remainingContent)
			}
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
			new Notice(`${error}`)
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

// The Notion API has submissions limits, need to check that the limits are not exceeded before submitting a page
// could be expanded into working around the limits via Append Block, but it doesn't look that easy
class checkAPILimits {
	maxChildDepth: number // currently can't exeed 2 levels
	blockLength: number // currently can't exceed 100 blocks
	blocks: any // the object array to be submitted

	constructor(blocks: any) {
		this.blocks = blocks,
		this.maxChildDepth = 0,
		this.blockLength = 0

		this.iterateBlocks(this.blocks, 0)
	}

	// recursively iterate over the blocks and count limits
	public iterateBlocks (blocks: any, childDepth: number) {
		const currentKeys = Object.keys(blocks)
		var currentMaxChildDepth = childDepth

		currentKeys.forEach(key => {
			// only counting blocks. Each block can contain other content types
			if (key == 'object' && blocks[key] == 'block') {
				this.blockLength++;
			}

			// counting if the block has children blocks
			if (key == 'children' && blocks[key] !== undefined) {
				currentMaxChildDepth++;
				// update the overall child depth count if the current branch goes deeper
				if (currentMaxChildDepth > this.maxChildDepth) {
					this.maxChildDepth = currentMaxChildDepth
				}
			}
		
			// recursively keep going if there are sub elements to the current block
			if (typeof blocks[key] === 'object' && blocks[key] !== null) {
				this.iterateBlocks(blocks[key], currentMaxChildDepth)
			}
		})
	}
}