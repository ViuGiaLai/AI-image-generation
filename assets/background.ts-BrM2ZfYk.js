chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!0}).catch(e=>console.error(e));
chrome.action.onClicked.addListener(e=>{e.id&&chrome.sidePanel.open({tabId:e.id})});
chrome.runtime.onMessage.addListener((e,t,n)=>{if(e&&e.action==="TAO_ANH_AI_OPEN_PANEL"&&t.tab&&t.tab.id)return chrome.sidePanel.open({tabId:t.tab.id}).then(()=>n({ok:!0})).catch(r=>{console.error(r),n({ok:!1,error:r instanceof Error?r.message:String(r)})}),!0});
