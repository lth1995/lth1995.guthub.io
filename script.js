// ################### 唯一需要修改的地方 ###################
const TENCENT_DOC_URL = "https://docs.qq.com/sheet/DV1NKeHJ2b2p0dVFM"; // 替换成https://docs.qq.com/d/xxxxxxx
// ###########################################################
let calendar;
// 初始化表格数据（确保id自增）
async function initTable() {
  try {
    const res = await fetch(`${TENCENT_DOC_URL}/export/xlsx`);
    if (!res.ok) throw new Error('表格链接错误');
  } catch (e) {
    alert('腾讯文档链接配置错误，请检查！');
    return;
  }
}
// 获取在线表格的预约数据
async function getEvents() {
  try {
    const xlsxUrl = `${TENCENT_DOC_URL}/export/xlsx`;
    const res = await fetch(xlsxUrl);
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    // 过滤有效数据并格式化
    return jsonData.filter(item => item.id && item.title).map(item => ({
      id: item.id.toString(),
      title: item.title,
      start: item.start,
      end: item.end || item.start,
      allDay: item.allDay === 'true' || item.allDay === true
    }));
  } catch (e) {
    alert('加载预约数据失败，刷新重试！');
    return [];
  }
}
// 向表格添加新预约
async function addEventToTable(eventData) {
  try {
    // 获取当前最大id，实现自增
    const events = await getEvents();
    const maxId = events.length > 0 ? Math.max(...events.map(e => parseInt(e.id))) : 0;
    eventData.id = maxId + 1;
    eventData.allDay = eventData.allDay ? 'true' : 'false';
    // 构造表单数据提交到腾讯文档（支持在线编辑）
    const formData = new FormData();
    formData.append('csv', `${eventData.id},${eventData.title},${eventData.start},${eventData.end},${eventData.allDay}`);
    // 自动追加数据到表格
    await fetch(`${TENCENT_DOC_URL}/import/csv?mode=append`, {
      method: 'POST',
      body: formData
    });
    return true;
  } catch (e) {
    alert('预约失败，刷新重试！');
    return false;
  }
}
// 更新表格中的预约（拖动修改时间）
async function updateEventInTable(eventId, newData) {
  try {
    const xlsxUrl = `${TENCENT_DOC_URL}/export/xlsx`;
    const res = await fetch(xlsxUrl);
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    // 找到并修改对应数据
    const index = jsonData.findIndex(item => item.id.toString() === eventId);
    if (index === -1) throw new Error('预约不存在');
    jsonData[index].start = newData.start;
    jsonData[index].end = newData.end || newData.start;
    // 重新生成表格并上传
    const newWorksheet = XLSX.utils.json_to_sheet(jsonData);
    workbook.Sheets[sheetName] = newWorksheet;
    const newArrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const formData = new FormData();
    formData.append('file', new Blob([newArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'temp.xlsx');
    await fetch(`${TENCENT_DOC_URL}/import/xlsx?mode=overwrite`, {
      method: 'POST',
      body: formData
    });
    return true;
  } catch (e) {
    alert('修改预约失败，刷新重试！');
    return false;
  }
}
// 从表格删除预约
async function deleteEventFromTable(eventId) {
  try {
    const xlsxUrl = `${TENCENT_DOC_URL}/export/xlsx`;
    const res = await fetch(xlsxUrl);
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    // 过滤掉要删除的数据
    const newJsonData = jsonData.filter(item => item.id.toString() !== eventId);
    // 重新生成表格并上传
    const newWorksheet = XLSX.utils.json_to_sheet(newJsonData);
    workbook.Sheets[sheetName] = newWorksheet;
    const newArrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const formData = new FormData();
    formData.append('file', new Blob([newArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'temp.xlsx');
    await fetch(`${TENCENT_DOC_URL}/import/xlsx?mode=overwrite`, {
      method: 'POST',
      body: formData
    });
    return true;
  } catch (e) {
    alert('删除预约失败，刷新重试！');
    return false;
  }
}
// 初始化日历
document.addEventListener('DOMContentLoaded', async function() {
  // 加载SheetJS库（解析Excel用，无需本地文件）
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  script.onload = async function() {
    await initTable();
    const calendarEl = document.getElementById('calendar');
    // 获取初始预约数据
    const initialEvents = await getEvents();
    calendar = new FullCalendar.Calendar(calendarEl, {
      locale: 'zh-cn',
      initialView: 'dayGridMonth',
      selectable: true,
      editable: true,
      events: initialEvents,
      // 新增预约
      select: async function(info) {
        // 分步骤输入预约信息（必填）
        const petName = prompt('请输入宠物名字：');
        const service = prompt('请输入预约服务（洗澡/美容/驱虫/诊疗）：');
        const phone = prompt('请输入联系电话：');
        const master = prompt('请选择预约师傅（张师傅/李师傅/王师傅/陈师傅）：');
        if (!petName || !service || !phone || !master) {
          alert('信息不能为空，请重新预约！');
          calendar.unselect();
          return;
        }
        // 拼接预约标题
        const title = `🐾${petName} | 📌${service} | 📞${phone} | 👨‍🔧${master}`;
        const eventData = {
          title: title,
          start: info.startStr,
          end: info.endStr,
          allDay: true
        };
        // 添加到表格并刷新日历
        const success = await addEventToTable(eventData);
        if (success) {
          calendar.refetchEvents(); // 刷新数据
          alert('预约成功！刷新页面查看最新列表');
        }
        calendar.unselect();
      },
      // 拖动修改预约时间
      eventDrop: async function(info) {
        const newData = {
          start: info.event.startStr,
          end: info.event.endStr
        };
        const success = await updateEventInTable(info.event.id, newData);
        if (success) {
          calendar.refetchEvents();
          alert('预约时间修改成功！刷新页面同步');
        } else {
          info.revert(); // 失败则恢复原位置
        }
      },
      // 删除预约
      eventClick: async function(info) {
        if (confirm('确认删除该预约吗？删除后无法恢复！')) {
          const success = await deleteEventFromTable(info.event.id);
          if (success) {
            calendar.refetchEvents();
            alert('预约删除成功！刷新页面同步');
          }
        }
      },
      // 手动刷新数据按钮（可选，加在日历顶部）
      customButtons: {
        refreshBtn: {
          text: '刷新预约',
          click: async function() {
            calendar.refetchEvents();
            alert('已刷新为最新预约数据！');
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
  };
  document.head.appendChild(script);
});
// 全局刷新方法（可手动调用）
window.refreshAppointments = async function() {
  if (calendar) {
    calendar.refetchEvents();
    alert('数据刷新成功！');
  }
};
