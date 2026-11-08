// Keep the user's configured seed UID intact; substitute only the one SQL config line in memory.
const declaration=/^DECLARE target_uid text := '(?:PASTE_USER_UID_HERE|[a-f0-9-]{36})';$/gim;
module.exports=function configureDemoSql(sql,user="PASTE_USER_UID_HERE") {
  const normalized=sql.replace(/\r\n/g,"\n");
  if([...normalized.matchAll(declaration)].length!==1)throw Error("Expected exactly one demo UID declaration");
  return normalized.replace(declaration,`DECLARE target_uid text := '${user}';`);
};
