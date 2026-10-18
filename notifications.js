export function isLiveAlert(message,now=Date.now()) {
  return Boolean(message.serverNotify)&&['text','priv'].includes(message.type)&&Number.isFinite(message.time)&&message.time>=now-60000&&message.time<=now+10000;
}
export class AlertManager {
  constructor({onAlert,onOpen,environment=globalThis}) {
    this.env=environment;this.onAlert=onAlert;this.onOpen=onOpen;this.seen=new Set();this.lastSystem=new Map();this.enabled=false;this.sound=false;this.audio=null;this.worker=null;
    try{this.enabled=environment.localStorage.getItem('acidum-notifications')==='yes';this.sound=environment.localStorage.getItem('acidum-alert-sound')==='yes';}catch{}
    environment.navigator?.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='acidum-open-account'&&typeof event.data.account==='string')this.onOpen(event.data.account);});
  }
  persist(){try{this.env.localStorage.setItem('acidum-notifications',this.enabled?'yes':'no');this.env.localStorage.setItem('acidum-alert-sound',this.sound?'yes':'no');}catch{}}
  async registration(){
    if(!this.env.navigator?.serviceWorker)return null;
    if(!this.worker)this.worker=this.env.navigator.serviceWorker.register('./notifications-sw.js').then(()=>this.env.navigator.serviceWorker.ready).catch(()=>{this.worker=null;return null;});
    return this.worker;
  }
  async enable(){
    const api=this.env.Notification;if(!api)return 'unsupported';
    // Called directly by a user action, as required by browsers.
    const permission=await api.requestPermission();
    this.enabled=permission==='granted';this.persist();
    if(this.enabled)await this.registration();return permission;
  }
  disable(){this.enabled=false;this.persist();}
  async setSound(value){
    this.sound=value;this.persist();
    if(value)await this.unlockSound();
  }
  async unlockSound(){
    if(!this.sound||this.audio?.state==='running')return;
    const Audio=this.env.AudioContext||this.env.webkitAudioContext;
    if(Audio){try{this.audio??=new Audio();await this.audio.resume();}catch{}}
  }
  play(){
    if(!this.sound||this.audio?.state!=='running')return;
    const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();
    oscillator.type='sine';oscillator.frequency.value=740;gain.gain.setValueAtTime(0.045,this.audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,this.audio.currentTime+0.14);oscillator.connect(gain);gain.connect(this.audio.destination);oscillator.start();oscillator.stop(this.audio.currentTime+0.15);
  }
  receive(message){
    if(!isLiveAlert(message))return false;
    const id=JSON.stringify([message.account,message.key]);if(this.seen.has(id))return false;
    this.seen.add(id);if(this.seen.size>300)this.seen.delete(this.seen.values().next().value);
    this.onAlert(message);this.play();
    if(this.enabled&&this.env.Notification?.permission==='granted'){
      const now=Date.now(),last=this.lastSystem.get(message.account)||0;
      if(now-last>=2000){this.lastSystem.set(message.account,now);this.show(message).catch(()=>{});}
    }
    return true;
  }
  async show(message){
    const title=`${message.account} · ${message.name||'Beskedalarm'}`;
    const options={body:message.text,tag:'acidum-'+message.account,icon:new URL('icon.svg',this.env.location.href).href,data:{account:message.account}};
    const registration=await this.registration();
    if(registration){await registration.showNotification(title,options);return;}
    try{const notification=new this.env.Notification(title,options);notification.onclick=()=>{this.env.focus?.();this.onOpen(message.account);notification.close();};}catch{}
  }
}
