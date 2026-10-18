const publicTypes=new Set(['text','join','part','quit']);
export function timelineGroups(messages,dayFor){
  const groups=[];
  for(const message of messages){
    const day=dayFor(message.time),kind=publicTypes.has(message.type)?'public':message.type==='priv'?'private':'';
    let group=groups.at(-1);
    if(!group||!kind||!message.name||group.day!==day||group.account!==message.account||group.name!==message.name||group.kind!==kind){
      group={day,kind,name:message.name,account:message.account,messages:[]};groups.push(group);
    }
    group.messages.push(message);
  }
  return groups;
}
