export const NoticeMsg: {[key: string]:any} = {
  "en": {
    "notion-logo": "Share to notion",
    "sync-success": "Sync to notion success: \n",
    "sync-fail": "Sync to notion fail: \n",
    "open-notion": "Please open the file that needs to be synchronized",
    "config-secrets-notion-api": "Please set up the notion API in the settings tab.",
    "config-secrets-database-id": "Please set up the database id in the settings tab.",
    "set-tags-fail": "Set tags fail,please check the frontmatter of the file or close the tag switch in the settings tab.",
  },
}

export const NoticeMConfig = (lang:any) :any => {
  return NoticeMsg[lang]
}