export function getConfig() {
  return {
    token:        localStorage.getItem('notion_token') || '',
    dbId:         localStorage.getItem('notion_dbid') || '',
    proxy:        localStorage.getItem('notion_proxy') || '',
    anthropicKey: localStorage.getItem('anthropic_key') || ''
  };
}

export function getMissingConfigKeys(cfg) {
  const missing = [];
  if (!cfg.token) missing.push('token');
  if (!cfg.dbId)  missing.push('dbId');
  if (!cfg.proxy) missing.push('proxy');
  return missing;
}

export function notionUrl(path, cfg) {
  const base = cfg.proxy ? cfg.proxy.replace(/\/$/, '') : 'https://api.notion.com';
  return base + path;
}

export function notionHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };
}
