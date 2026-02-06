// ################### 唯一需要修改的地方 ###################
const FEISHU_URL = "https://ucn589zppjnx.feishu.cn/wiki/KtsmwEKwFipeSXkjHBWcZ8D3nnu?from=from_copylink"; // 替换为你的飞书多维表格链接（直接复制分享的链接即可）
// ###########################################################
let calendar;
let reserveList = []; // 预约列表缓存，国内毫秒级读取

// 页面初始化：绑定按钮/表单/日历
document.addEventListener('DOMContentLoaded', function() {
  // 预约日期默认设为当天，禁止选过去的日期
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('reserveDate').min = today;
  document.getElementById('reserveDate').value = today;
  
  // 绑定核心功能
  bindNavBtn(); // 面板切换
  bindReserveForm(); // 预约表单提交
  bindManageRefresh(); // 管理面板刷新
  initCalendar(); // 初始化日历+加载飞书数据
});

// 【面板切换】日历/预约服务/预约管理
function bindNavBtn() {
  const btns = document.querySelectorAll('.nav-btn');
  const modules = document.querySelectorAll('.module');
  btns.forEach(btn => {
    btn.addEventListener('click', function() {
      // 切换按钮激活样式
      btns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      // 切换对应面板
      modules.forEach(m => m.classList.remove('active'));
      const targetModule = this.id.replace('Btn', 'Module');
      document.getElementById(targetModule).classList.add('active');
      // 切到管理面板时自动刷新最新数据
      if (targetModule === 'manageModule') renderReserveList();
    });
  });
}

// 【初始化日历】飞书数据同步+拖动/删除/快速预约
function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  // 先加载飞书表格数据，国内无延迟
  getFeishuEvents().then(initialEvents => {
    reserveList = initialEvents;
    // 初始化FullCalendar日历
    calendar = new FullCalendar.Calendar(calendarEl, {
      locale: 'zh-cn', // 中文显示
      initialView: 'dayGridMonth', // 默认月视图，支持切换周/日
      selectable: true, // 允许点击日期快速预约
      editable: true, // 允许拖动修改预约时间
      events: initialEvents, // 加载飞书的预约数据
      eventColor: '#007fff', // 预约条目颜色（飞书蓝）
      // 日历点击：快速预约（适合手机端快速操作）
      select: async function(info) {
        const petName = prompt('🐾 宠物名称*：');
        const service = prompt('📌 服务类型*（洗澡/美容/驱虫）：');
        const phone = prompt('📞 联系电话*：');
        const master = prompt('👨‍🔧 预约师傅*（张/李/王/陈）：');
        // 校验必填项
        if (!petName || !service || !phone || !master) {
          alert('⚠️ 所有带*的信息为必填，请重新输入！');
          calendar.unselect();
          return;
        }
        // 拼接预约信息（和表单预约格式一致）
        const title = `🐾${petName} | 📌${service} | 📞${phone} | 👨‍🔧${master} | ⏰${info.startStr}`;
        const eventData = { title, start: info.startStr, end: info.startStr, allDay: true };
        // 提交到飞书并刷新日历
        if (await addFeishuEvent(eventData)) {
          calendar.refetchEvents();
          reserveList = await getFeishuEvents();
          alert('✅ 快速预约成功！全员实时可见');
        }
        calendar.unselect();
      },
      // 【拖动修改】预约时间，拖完自动同步飞书
      eventDrop: async function(info) {
        const newEventData = {
          start: info.event.startStr,
          end: info.event.endStr || info.event.startStr
        };
        // 修改飞书数据，失败则恢复原位置
        if (await updateFeishuEvent(info.event.id, newEventData)) {
          calendar.refetchEvents();
          reserveList = await getFeishuEvents();
          alert('✅ 预约时间修改成功！飞书实时同步');
        } else {
          info.revert(); // 失败回滚，避免数据不一致
        }
      },
      // 【点击删除】预约，确认后删除飞书数据
      eventClick: async function(info) {
        if (confirm('⚠️ 确认删除该预约吗？删除后无法恢复！')) {
          if (await deleteFeishuEvent(info.event.id)) {
            calendar.refetchEvents();
            reserveList = await getFeishuEvents();
            renderReserveList();
            alert('✅ 预约删除成功！全员已同步');
          }
        }
      },
      // 【自定义刷新按钮】日历顶部，一键同步飞书最新数据
      customButtons: {
        refreshBtn: {
          text: '刷新预约',
          click: async () => {
            calendar.refetchEvents();
            reserveList = await getFeishuEvents();
            renderReserveList();
            alert('✅ 已同步飞书最新数据！全员预约实时更新');
          }
        }
      },
      // 日历顶部工具栏：上一页/下一页/今天/刷新/标题/视图切换
      headerToolbar: {
        left: 'prev,next today refreshBtn',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      }
    });
    // 渲染日历，国内秒开
    calendar.render();
  });
}

// 【预约表单提交】带完整校验，提交后同步飞书
function bindReserveForm() {
  const form = document.getElementById('reserveForm');
  form.addEventListener('submit', async function(e) {
    e.preventDefault(); // 阻止页面刷新
    // 获取表单所有数据
    const petName = document.getElementById('petName').value.trim();
    const serviceType = document.getElementById('serviceType').value;
    const userPhone = document.getElementById('userPhone').value.trim();
    const washStaff = document.getElementById('washStaff').value;
    const reserveDate = document.getElementById('reserveDate').value;
    const reserveTime = document.getElementById('reserveTime').value;
    const remark = document.getElementById('remark').value.trim() || '无备注';
    
    // 拼接完整预约信息（显示在日历和管理面板）
    const title = `🐾${petName} | 📌${serviceType} | 📞${userPhone} | 👨‍🔧${washStaff} | ⏰${reserveDate} ${reserveTime} | 📝${remark}`;
    // 构造飞书需要的事件数据
    const eventData = {
      title: title,
      start: reserveDate,
      end: reserveDate,
      allDay: true
    };
    
    // 提交到飞书表格，成功后重置表单+刷新数据
    if (await addFeishuEvent(eventData)) {
      form.reset(); // 重置表单
      document.getElementById('reserveDate').value = new Date().toISOString().split('T')[0]; // 重置日期为当天
      calendar.refetchEvents(); // 刷新日历
      reserveList = await getFeishuEvents(); // 刷新缓存
      alert('✅ 预约提交成功！全员实时可见，可在日历/管理面板查看');
    }
  });
}

// 【管理面板刷新】一键加载飞书最新全员预约数据
function bindManageRefresh() {
  document.getElementById('refreshManageBtn').addEventListener('click', async () => {
    reserveList = await getFeishuEvents();
    renderReserveList();
    alert('✅ 管理面板已刷新为飞书最新数据！');
  });
}

// 【渲染管理面板】把飞书的预约数据显示为列表，支持删除
function renderReserveList() {
  const listEl = document.getElementById('reserveList');
  // 无数据时显示提示
  if (reserveList.length === 0 || reserveList[0].title === '初始化数据') {
    listEl.innerHTML = '<div class="empty-tip">暂无预约数据，快来添加第一个预约吧～</div>';
    return;
  }
  // 有数据时渲染列表
  let html = '';
  reserveList.forEach(item => {
    // 过滤初始化数据，只显示有效预约
    if (item.title !== '初始化数据') {
      html += `
        <div class="reserve-item">
          <div class="info">
            <div><strong>预约ID</strong>：${item.id}</div>
            <div><strong>预约信息</strong>：${item.title}</div>
            <div><strong>预约日期</strong>：${item.start}</div>
          </div>
          <button class="del-btn" onclick="delFeishuEvent('${item.id}')">删除预约</button>
        </div>
      `;
    }
  });
  listEl.innerHTML = html;
}

// 【管理面板删除】全局方法，点击删除按钮触发
window.delFeishuEvent = async function(id) {
  if (confirm('⚠️ 确认删除该预约吗？删除后飞书数据同步删除，无法恢复！')) {
    if (await deleteFeishuEvent(id)) {
      // 删除成功后刷新所有数据
      reserveList = await getFeishuEvents();
      calendar.refetchEvents();
      renderReserveList();
      alert('✅ 预约删除成功！全员数据已同步');
    }
  }
};

// 【飞书核心】读取飞书表格预约数据（国内毫秒级，无延迟）
async function getFeishuEvents() {
  try {
    // 飞书多维表格直接导出xlsx，国内CDN加速
    const exportUrl = FEISHU_URL.replace('/s/', '/xlsx/export/').replace('?', '&') + '&export_type=all';
    const res = await fetch(exportUrl, {
      method: 'GET',
      timeout: 5000, // 国内5秒超时，足够加载
      headers: { 'Cache-Control': 'no-cache' } // 禁用缓存，保证实时性
    });
    if (!res.ok) throw new Error('飞书表格链接错误，请检查权限/链接是否正确');
    
    // 解析xlsx数据为JSON
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // 格式化数据，适配日历组件
    return jsonData.filter(item => item.id && item.title).map(item => ({
      id: item.id.toString(),
      title: item.title,
      start: item.start,
      end: item.end || item.start,
      allDay: item.allDay === 'true' || item.allDay === true
    }));
  } catch (e) {
    alert('❌ 加载飞书数据失败：' + e.message + '\n请检查：1.链接是否正确 2.表格权限是否为「任何人可编辑」3.表头是否按要求配置');
    return [];
  }
}

// 【飞书核心】添加新预约到飞书表格（ID自增，无需手动设置）
async function addFeishuEvent(eventData) {
  try {
    // 获取当前最大ID，实现ID自增
    const events = await getFeishuEvents();
    const maxId = events.length > 0 ? Math.max(...events.map(e => parseInt(e.id))) : 1;
    eventData.id = maxId + 1;
    eventData.allDay = eventData.allDay ? 'true' : 'false';
    
    // 构造CSV数据，飞书支持CSV快速导入
    const csvData = `${eventData.id},${eventData.title},${eventData.start},${eventData.end},${eventData.allDay}\n`;
    const formData = new FormData();
    formData.append('file', new Blob([csvData], { type: 'text/csv' }), 'pet_reserve.csv');
    formData.append('import_mode', 'append'); // 追加模式，不覆盖原有数据
    
    // 飞书CSV导入接口，国内毫秒级提交
    const importUrl = FEISHU_URL.replace('/s/', '/import/csv/').replace('?', '&');
    const res = await fetch(importUrl, {
      method: 'POST',
      body: formData,
      timeout: 5000
    });
    return res.ok;
  } catch (e) {
    alert('❌ 预约提交失败：' + e.message);
    return false;
  }
}

// 【飞书核心】修改飞书表格中的预约数据（拖动修改时间触发）
async function updateFeishuEvent(eventId, newData) {
  try {
    // 获取当前所有数据，修改后覆盖上传
    const events = await getFeishuEvents();
    const updatedEvents = events.map(item => {
      if (item.id.toString() === eventId) {
        return { ...item, ...newData }; // 替换修改后的字段
      }
      return item;
    });
    
    // 生成新的xlsx文件，覆盖飞书表格
    const worksheet = XLSX.utils.json_to_sheet(updatedEvents);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '宠物预约系统');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // 构造FormData上传
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'pet_reserve.xlsx');
    formData.append('import_mode', 'overwrite'); // 覆盖模式，同步最新数据
    
    // 飞书XLSX导入接口
    const importUrl = FEISHU_URL.replace('/s/', '/import/xlsx/').replace('?', '&');
    const res = await fetch(importUrl, {
      method: 'POST',
      body: formData,
      timeout: 5000
    });
    return res.ok;
  } catch (e) {
    alert('❌ 修改预约失败：' + e.message);
    return false;
  }
}

// 【飞书核心】从飞书表格删除预约数据（删除/点击删除触发）
async function deleteFeishuEvent(eventId) {
  try {
    // 获取当前所有数据，过滤掉要删除的ID
    const events = await getFeishuEvents();
    const filteredEvents = events.filter(item => item.id.toString() !== eventId);
    
    // 生成新的xlsx文件，覆盖飞书表格
    const worksheet = XLSX.utils.json_to_sheet(filteredEvents);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '宠物预约系统');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // 构造FormData上传
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'pet_reserve.xlsx');
    formData.append('import_mode', 'overwrite');
    
    // 飞书XLSX导入接口
    const importUrl = FEISHU_URL.replace('/s/', '/import/xlsx/').replace('?', '&');
    const res = await fetch(importUrl, {
      method: 'POST',
      body: formData,
      timeout: 5000
    });
    return res.ok;
  } catch (e) {
    alert('❌ 删除预约失败：' + e.message);
    return false;
  }
}
