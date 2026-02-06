const TENCENT_URL = "https://docs.qq.com/sheet/DV0JTVEJNcnFoVnNk?tab=BB08J2"; // 替换为新的腾讯文档链接
let calendar;
let reserveList = [];

document.addEventListener('DOMContentLoaded', function() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('reserveDate').min = today;
  document.getElementById('reserveDate').value = today;
  bindNavBtn();
  bindReserveForm();
  bindManageRefresh();
  initCalendar();
});

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
      if (targetModule === 'manageModule') renderReserveList();
    });
  });
}

async function getTencentEvents() {
  try {
    const exportUrl = TENCENT_URL.replace('/d/', '/xlsx/export/');
    const res = await fetch(exportUrl, { timeout: 5000 });
    if (!res.ok) throw new Error('腾讯文档链接错误');
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    return json.filter(item => item.id && item.title).map(item => ({
      id: item.id.toString(), title: item.title, start: item.start, end: item.end || item.start, allDay: item.allDay === 'true'
    }));
  } catch (e) {
    alert('加载数据失败：' + e.message);
    return [];
  }
}

async function addTencentEvent(eventData) {
  try {
    const events = await getTencentEvents();
    const maxId = events.length > 0 ? Math.max(...events.map(e => parseInt(e.id))) : 1;
    eventData.id = maxId + 1;
    eventData.allDay = eventData.allDay ? 'true' : 'false';
    const csv = `${eventData.id},${eventData.title},${eventData.start},${eventData.end},${eventData.allDay}\n`;
    const formData = new FormData();
    formData.append('file', new Blob([csv], { type: 'text/csv' }), 'reserve.csv');
    const importUrl = TENCENT_URL.replace('/d/', '/import/csv/') + '?mode=append';
    const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
    return res.ok;
  } catch (e) {
    alert('提交失败：' + e.message);
    return false;
  }
}

function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  getTencentEvents().then(initialEvents => {
    reserveList = initialEvents;
    calendar = new FullCalendar.Calendar(calendarEl, {
      locale: 'zh-cn',
      initialView: 'dayGridMonth',
      selectable: true,
      editable: true,
      events: initialEvents,
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
      eventDrop: async function(info) {
        const events = await getTencentEvents();
        const updatedEvents = events.map(e => e.id === info.event.id ? { ...e, start: info.event.startStr, end: info.event.endStr } : e);
        const worksheet = XLSX.utils.json_to_sheet(updatedEvents);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const formData = new FormData();
        formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
        const importUrl = TENCENT_URL.replace('/d/', '/import/xlsx/') + '?mode=overwrite';
        const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
        if (res.ok) {
          calendar.refetchEvents();
          alert('修改成功！');
        } else {
          info.revert();
        }
      },
      eventClick: async function(info) {
        if (confirm('确认删除？')) {
          const events = await getTencentEvents();
          const filteredEvents = events.filter(e => e.id !== info.event.id);
          const worksheet = XLSX.utils.json_to_sheet(filteredEvents);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
          const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const formData = new FormData();
          formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
          const importUrl = TENCENT_URL.replace('/d/', '/import/xlsx/') + '?mode=overwrite';
          const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
          if (res.ok) {
            calendar.refetchEvents();
            renderReserveList();
            alert('删除成功！');
          }
        }
      },
      customButtons: {
        refreshBtn: {
          text: '刷新预约',
          click: async () => {
            reserveList = await getTencentEvents();
            calendar.refetchEvents();
            renderReserveList();
            alert('已同步最新数据！');
          }
        }
      },
      headerToolbar: {
        left: 'prev,next today refreshBtn',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      }
    });
    calendar.render();
  });
}

function bindReserveForm() {
  const form = document.getElementById('reserveForm');
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const petName = document.getElementById('petName').value.trim();
    const serviceType = document.getElementById('serviceType').value;
    const userPhone = document.getElementById('userPhone').value.trim();
    const washStaff = document.getElementById('washStaff').value;
    const reserveDate = document.getElementById('reserveDate').value;
    const reserveTime = document.getElementById('reserveDate').value;
    const remark = document.getElementById('remark').value.trim() || '无';
    const title = `🐾${petName} | 📌${serviceType} | 📞${userPhone} | 👨‍🔧${washStaff} | ⏰${reserveDate} ${reserveTime} | 📝${remark}`;
    const eventData = { title, start: reserveDate, end: reserveDate, allDay: true };
    if (await addTencentEvent(eventData)) {
      form.reset();
      document.getElementById('reserveDate').value = new Date().toISOString().split('T')[0];
      calendar.refetchEvents();
      reserveList = await getTencentEvents();
      alert('预约提交成功！');
    }
  });
}

function bindManageRefresh() {
  document.getElementById('refreshManageBtn').addEventListener('click', async () => {
    reserveList = await getTencentEvents();
    renderReserveList();
    alert('管理面板已刷新！');
  });
}

function renderReserveList() {
  const listEl = document.getElementById('reserveList');
  if (reserveList.length === 0 || reserveList[0].title === '初始化数据') {
    listEl.innerHTML = '<div class="empty-tip">暂无预约数据</div>';
    return;
  }
  let html = '';
  reserveList.forEach(item => {
    if (item.title !== '初始化数据') {
      html += `<div class="reserve-item"><div class="info"><div><strong>ID</strong>：${item.id}</div><div><strong>信息</strong>：${item.title}</div><div><strong>日期</strong>：${item.start}</div></div><button class="del-btn" onclick="delEvent('${item.id}')">删除</button></div>`;
    }
  });
  listEl.innerHTML = html;
}

window.delEvent = async function(id) {
  if (confirm('确认删除？')) {
    const events = await getTencentEvents();
    const filteredEvents = events.filter(e => e.id !== id);
    const worksheet = XLSX.utils.json_to_sheet(filteredEvents);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'reserve.xlsx');
    const importUrl = TENCENT_URL.replace('/d/', '/import/xlsx/') + '?mode=overwrite';
    const res = await fetch(importUrl, { method: 'POST', body: formData, timeout: 5000 });
    if (res.ok) {
      reserveList = await getTencentEvents();
      calendar.refetchEvents();
      renderReserveList();
      alert('删除成功！');
    }
  }
};
