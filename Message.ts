export const NoticeMsg: {[key: string]:any} = {
  "en": {
    "settings-missing" : "Please set up the notion API and database ID in the settings tab."
    "notion-logo": "Share to notion",
    "sync-success": "Sync to notion success: \n",
    "sync-fail": "Sync to notion fail: \n",
    "open-notion": "Please open the file that needs to be synchronized",
    "config-secrets-notion-api": "Please set up the notion API in the settings tab.",
    "config-secrets-database-id": "Please set up the database ID in the settings tab.",
    "set-tags-fail": "Set tags failed,please check the frontmatter of the file or uncheck the tag switch in the settings tab.",
  },
}

export const NoticeMConfig = (lang:any) :any => {
  return NoticeMsg[lang]
}