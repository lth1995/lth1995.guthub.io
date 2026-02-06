// 已配置你的腾讯文档在线表格链接（确认是sheet开头的普通表格）
const TENCENT_URL = "https://docs.qq.com/sheet/DUEdqR2xkVk5Ta0p0?tab=BB08J2";
let calendar;
let reserveList = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  const today = new Date().toISOString().split('T')[0];
  // 预约日期默认今天，禁止选择过去日期
  document.getElementById('reserveDate').min = today;
  document.getElementById('reserveDate').value = today;
  // 绑定所有事件
  bindNavBtn();
  bindReserveForm();
  bindManageRefresh();
  initCalendar();
});

// 导航按钮切换
function bindNavBtn() {
  const btns = document.querySelectorAll('.nav-btn');
  const modules = document.querySelectorAll('.module');
  btns.forEach(btn => {
    btn.addEventListener('click', function() {
      btns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      modules.forEach(m => m.classList.remove('active'));
      const targetModule = this.id.replace('Btn', 'Module');
      document.getElementById(targetModule).classList.add('active');
      // 切换到管理面板时刷新列表
      if (targetModule === 'manageModule') renderReserveList();
    });
  });
}

// 从腾讯文档获取预约数据
async function getTencentEvents() {
  try {
    // 适配腾讯文档sheet链接的导出地址
    const exportUrl = TENCENT_URL.replace('/sheet/', '/xlsx/export/');
    const res = await fetch(exportUrl, { timeout: 5000 });
    if (!res.ok) throw new Error('腾讯文档链接无效/权限不足');
    const arrayBuffer = await res.arrayBuffer();
    // 解析Excel数据
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    // 过滤有效数据并格式化
    return json.filter(item => item.id && item.title).map(item => ({
      id: item.id.toString(),
      title: item.title,
      start: item.start,
      end: item.end || item.start,
      allDay: item.allDay === 'true'
    }));
  } catch (e) {
    alert('加载预约数据失败：' + e.message);
    return [];
  }
}

// 向腾讯文档添加预约数据
async function addTencentEvent(eventData) {
  try {
    const events = await getTencentEvents();
    // 自动生成自增ID
    const maxId = events.length > 0 ? Math.max(...events.map(e => parseInt(e.id))) : 1;
    eventData.id = maxId + 1;
    eventData.allDay = eventData.allDay ? 'true' : 'false';
    // 构造CSV数据用于追加
    const csv = `${eventData.id},${eventData.title},${eventData.start},${eventData.end},${eventData.allDay}\n`;
    const formData = new FormData();
    formData.append('file', new Blob([csv], { type: 'text/csv' }), 'reserve.csv');
    // 适配腾讯文档sheet链接的导入地址（追加模式）
    const importUrl = TENCENT_URL.replace('/sheet/', '/import/csv/') + '?mode=append';
    const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
    return res.ok;
  } catch (e) {
    alert('提交预约失败：' + e.message);
    return false;
  }
}

// 初始化日历
function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  getTencentEvents().then(initialEvents => {
    reserveList = initialEvents;
    calendar = new FullCalendar.Calendar(calendarEl, {
      locale: 'zh-cn', // 中文
      initialView: 'dayGridMonth', // 月视图
      selectable: true, // 可选择日期
      editable: true, // 可拖拽修改
      events: initialEvents, // 初始数据
      // 日历选择日期预约
      select: async function(info) {
        const petName = prompt('宠物名称*：');
        const service = prompt('服务类型*：');
        const phone = prompt('联系电话*：');
        const master = prompt('预约师傅*：');
        if (!petName || !service || !phone || !master) {
          alert('信息不能为空！');
          calendar.unselect();
          return;
        }
        const title = `🐾${petName} | 📌${service} | 📞${phone} | 👨‍🔧${master}`;
        const eventData = { title, start: info.startStr, end: info.startStr, allDay: true };
        if (await addTencentEvent(eventData)) {
          calendar.refetchEvents();
          alert('预约成功！');
        }
        calendar.unselect();
      },
      // 拖拽修改预约日期
      eventDrop: async function(info) {
        const events = await getTencentEvents();
        const updatedEvents = events.map(e => e.id === info.event.id ? { ...e, start: info.event.startStr, end: info.event.endStr } : e);
        // 生成新的Excel文件覆盖原数据
        const worksheet = XLSX.utils.json_to_sheet(updatedEvents);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const formData = new FormData();
        formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
        const importUrl = TENCENT_URL.replace('/sheet/', '/import/xlsx/') + '?mode=overwrite';
        const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
        if (res.ok) {
          calendar.refetchEvents();
          alert('预约日期修改成功！');
        } else {
          info.revert(); // 失败则还原拖拽
        }
      },
      // 点击事件删除预约
      eventClick: async function(info) {
        if (confirm('确认删除该预约吗？')) {
          const events = await getTencentEvents();
          const filteredEvents = events.filter(e => e.id !== info.event.id);
          // 生成新的Excel文件覆盖原数据
          const worksheet = XLSX.utils.json_to_sheet(filteredEvents);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
          const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const formData = new FormData();
          formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
          const importUrl = TENCENT_URL.replace('/sheet/', '/import/xlsx/') + '?mode=overwrite';
          const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
          if (res.ok) {
            calendar.refetchEvents();
            renderReserveList(); // 刷新管理列表
            alert('预约删除成功！');
          }
        }
      },
      // 自定义刷新按钮
      customButtons: {
        refreshBtn: {
          text: '刷新预约',
          click: async () => {
            reserveList = await getTencentEvents();
            calendar.refetchEvents();
            renderReserveList();
            alert('已同步腾讯文档最新预约数据！');
          }
        }
      },
      // 日历头部工具栏
      headerToolbar: {
        left: 'prev,next today refreshBtn',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      }
    });
    calendar.render(); // 渲染日历
  });
}

// 绑定预约表单提交
function bindReserveForm() {
  const form = document.getElementById('reserveForm');
  form.addEventListener('submit', async function(e) {
    e.preventDefault(); // 阻止默认提交
    // 获取表单数据
    const petName = document.getElementById('petName').value.trim();
    const serviceType = document.getElementById('serviceType').value;
    const userPhone = document.getElementById('userPhone').value.trim();
    const washStaff = document.getElementById('washStaff').value;
    const reserveDate = document.getElementById('reserveDate').value;
    const remark = document.getElementById('remark').value.trim() || '无';
    // 构造预约标题
    const title = `🐾${petName} | 📌${serviceType} | 📞${userPhone} | 👨‍🔧${washStaff} | ⏰${reserveDate} | 📝${remark}`;
    const eventData = { title, start: reserveDate, end: reserveDate, allDay: true };
    // 提交到腾讯文档
    if (await addTencentEvent(eventData)) {
      form.reset(); // 重置表单
      document.getElementById('reserveDate').value = new Date().toISOString().split('T')[0]; // 重置日期为今天
      calendar.refetchEvents(); // 刷新日历
      reserveList = await getTencentEvents(); // 刷新数据列表
      alert('预约提交成功！');
    }
  });
}

// 绑定管理面板刷新按钮
function bindManageRefresh() {
  document.getElementById('refreshManageBtn').addEventListener('click', async () => {
    reserveList = await getTencentEvents();
    renderReserveList();
    alert('预约管理列表已刷新！');
  });
}

// 渲染预约管理列表
function renderReserveList() {
  const listEl = document.getElementById('reserveList');
  // 无数据/仅初始化数据时显示提示
  if (reserveList.length === 0 || (reserveList.length === 1 && reserveList[0].title === '初始化数据')) {
    listEl.innerHTML = '<div class="empty-tip">暂无预约数据</div>';
    return;
  }
  // 渲染预约列表
  let html = '';
  reserveList.forEach(item => {
    if (item.title !== '初始化数据') { // 过滤初始化数据
      html += `<div class="reserve-item">
        <div class="info">
          <div><strong>预约ID</strong>：${item.id}</div>
          <div><strong>预约信息</strong>：${item.title}</div>
          <div><strong>预约日期</strong>：${item.start}</div>
        </div>
        <button class="del-btn" onclick="delEvent('${item.id}')">删除</button>
      </div>`;
    }
  });
  listEl.innerHTML = html;
}

// 全局删除预约方法
window.delEvent = async function(id) {
  if (confirm('确认删除该预约吗？删除后不可恢复！')) {
    const events = await getTencentEvents();
    const filteredEvents = events.filter(e => e.id !== id);
    // 生成新的Excel文件覆盖原数据
    const worksheet = XLSX.utils.json_to_sheet(filteredEvents);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
    const importUrl = TENCENT_URL.replace('/sheet/', '/import/xlsx/') + '?mode=overwrite';
    const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
    if (res.ok) {
      reserveList = await getTencentEvents();
      calendar.refetchEvents(); // 刷新日历
      renderReserveList(); // 刷新管理列表
      alert('预约删除成功！');
    }
  }
};
