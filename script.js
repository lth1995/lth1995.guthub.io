// 替换为你的飞书开放平台信息
const FEISHU_APP_ID = "cli_a90f4b86ce789ceb";
const FEISHU_APP_SECRET = "7zTMMkihSn2w2BCqefGe0gGiOtHQiQz8";
const FEISHU_BITABLE_APP_TOKEN = "ucn589zppjnx"; // 表格链接中的`app_token`参数
const FEISHU_BITABLE_SHEET_ID = "tbl6hJEUb11YaqbF"; // 表格链接中的`sheet_id`参数

let calendar;
let reserveList = [];

// 获取飞书访问令牌
async function getFeishuToken() {
  const res = await fetch(`https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
  });
  const data = await res.json();
  return data.app_access_token;
}

// 读取飞书表格数据
async function getFeishuEvents() {
  const token = await getFeishuToken();
  const res = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BITABLE_APP_TOKEN}/tables/${FEISHU_BITABLE_SHEET_ID}/records`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.data.items.map(item => ({
    id: item.fields.id.toString(),
    title: item.fields.title,
    start: item.fields.start,
    end: item.fields.end || item.fields.start,
    allDay: item.fields.allDay === 'true'
  })).filter(item => item.id);
}

// 添加飞书表格数据
async function addFeishuEvent(eventData) {
  const token = await getFeishuToken();
  const events = await getFeishuEvents();
  const maxId = events.length > 0 ? Math.max(...events.map(e => parseInt(e.id))) : 1;
  eventData.id = maxId + 1;
  eventData.allDay = eventData.allDay ? 'true' : 'false';
  
  const res = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BITABLE_APP_TOKEN}/tables/${FEISHU_BITABLE_SHEET_ID}/records`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: eventData })
  });
  return res.ok;
}

// 页面初始化逻辑（与之前一致，略）
document.addEventListener('DOMContentLoaded', function() {
  // 原有初始化代码（bindNavBtn、bindReserveForm等）
  // ...
});
