const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase('da');
export function mentionQuery(text,cursor=text.length) {
  const before=text.slice(0,cursor), match=before.match(/(?:^|[\s([{])@([^\s@]*)$/u);
  return match?{start:cursor-match[1].length-1,end:cursor,prefix:match[1]}:null;
}
export function mentionSuggestions(users,query,limit=6) {
  if(!query)return [];
  const prefix=normalize(query.prefix);
  return [...new Set(users.filter(name=>typeof name==='string'))].filter(name=>normalize(name).startsWith(prefix)).sort((a,b)=>a.localeCompare(b,'da')).slice(0,limit);
}
export function completeMention(text,query,name,limit=100) {
  if(!query)return null;
  const tail=text.slice(query.end), extension=tail.match(/^[\p{L}\p{N}_-]*/u)[0];
  const suffix=tail.slice(extension.length), insertion=name+(!suffix||!/^[\s.,!?;:]/u.test(suffix)?' ':'');
  const result=text.slice(0,query.start)+insertion+suffix;
  if(result.length>limit)return null;
  const caret=query.start+insertion.length+(suffix.startsWith(' ')?1:0);
  return {text:result,caret};
}
