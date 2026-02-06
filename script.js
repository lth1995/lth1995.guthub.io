// 全局配置
const reserveKey = 'petReserveList'; // 本地存储键名
const timeList = ["10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00"]; // 时间点
const staffList = ["姚梦蝶","李天昊","刘贝","庄晓雷","杨波"]; // 服务人员
// 洗护时长对应占用时间块数量（30分钟=1块，45分钟=2块，60分钟=2块，90分钟=3块）
const timeBlockMap = {
    "30分钟": 1,
    "45分钟": 2,
    "60分钟": 2,
    "90分钟": 3
};
let reserveList = JSON.parse(localStorage.getItem(reserveKey)) || [];
let occupyData = {}; // 占用数据：{日期: {师傅: {时间点: true/false}}}
let dragState = { isDragging: false, startX: -1, startY: -1, endX: -1, endY: -1, isRightClick: false };

// 页面元素获取
const reserveBtn = document.getElementById('reserveBtn');
const myReserveBtn = document.getElementById('myReserveBtn');
const adminBtn = document.getElementById('adminBtn');
const reserveModule = document.getElementById('reserveModule');
const myReserveModule = document.getElementById('myReserveModule');
const adminModule = document.getElementById('adminModule');
const reserveForm = document.getElementById('reserveForm');
const myReserveList = document.getElementById('myReserveList');
const myEmptyTip = document.getElementById('myEmptyTip');
const adminReserveList = document.getElementById('adminReserveList');
const adminEmptyTip = document.getElementById('adminEmptyTip');
const adminLogin = document.getElementById('adminLogin');
const adminContent = document.getElementById('adminContent');
const adminPwd = document.getElementById('adminPwd');
const loginBtn = document.getElementById('loginBtn');
const reserveDate = document.getElementById('reserveDate');
const reserveTime = document.getElementById('reserveTime');
const statsDate = document.getElementById('statsDate');
const queryStatsBtn = document.getElementById('queryStatsBtn');
const statsTable = document.getElementById('statsTable');

// 初始化
const today = new Date().toISOString().split('T')[0];
reserveDate.min = today;
statsDate.min = today;
statsDate.value = today;
initOccupyData(); // 初始化占用数据
bindDragEvent();  // 绑定拖动事件

// 导航切换
reserveBtn.addEventListener('click', () => switchModule('reserve'));
myReserveBtn.addEventListener('click', () => {
    switchModule('my');
    renderMyReserve();
});
adminBtn.addEventListener('click', () => {
    switchModule('admin');
    if (adminContent.style.display === 'block') {
        renderStatsTable(statsDate.value);
    }
});

// 模块切换函数
function switchModule(type) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.module').forEach(mod => mod.classList.remove('active'));
    if (type === 'reserve') {
        reserveBtn.classList.add('active');
        reserveModule.classList.add('active');
    } else if (type === 'my') {
        myReserveBtn.classList.add('active');
        myReserveModule.classList.add('active');
    } else if (type === 'admin') {
        adminBtn.classList.add('active');
        adminModule.classList.add('active');
    }
}

// 初始化占用数据（从预约记录生成）
function initOccupyData() {
    occupyData = {};
    reserveList.forEach(item => {
        const { date, washStaff, time, washTime } = item;
        const blockNum = timeBlockMap[washTime];
        const timeIndex = timeList.findIndex(t => t === time);
        if (timeIndex === -1) return;
        // 初始化日期和师傅的占用数据
        if (!occupyData[date]) occupyData[date] = {};
        if (!occupyData[date][washStaff]) occupyData[date][washStaff] = {};
        // 标记所有占用的时间点
        for (let i = 0; i < blockNum; i++) {
            const targetTime = timeList[timeIndex + i];
            if (targetTime) occupyData[date][washStaff][targetTime] = true;
        }
    });
}

// 校验预约是否冲突（核心联动校验）
function checkOccupyConflict(date, staff, time, washTime) {
    const blockNum = timeBlockMap[washTime];
    const timeIndex = timeList.findIndex(t => t === time);
    if (timeIndex === -1) return true;
    // 初始化占用数据
    if (!occupyData[date]) occupyData[date] = {};
    if (!occupyData[date][staff]) occupyData[date][staff] = {};
    // 校验每个时间块是否被占用
    for (let i = 0; i < blockNum; i++) {
        const targetTime = timeList[timeIndex + i];
        if (targetTime && occupyData[date][staff][targetTime]) {
            return true; // 冲突
        }
    }
    return false; // 无冲突
}

// 标记预约占用的时间点
function markOccupyTime(date, staff, time, washTime) {
    const blockNum = timeBlockMap[washTime];
    const timeIndex = timeList.findIndex(t => t === time);
    if (timeIndex === -1) return;
    if (!occupyData[date]) occupyData[date] = {};
    if (!occupyData[date][staff]) occupyData[date][staff] = {};
    for (let i = 0; i < blockNum; i++) {
        const targetTime = timeList[timeIndex + i];
        if (targetTime) occupyData[date][staff][targetTime] = true;
    }
    // 刷新可视化
    if (adminContent.style.display === 'block' && statsDate.value === date) {
        renderStatsTable(date);
    }
}

// 释放预约占用的时间点
function releaseOccupyTime(date, staff, time, washTime) {
    const blockNum = timeBlockMap[washTime];
    const timeIndex = timeList.findIndex(t => t === time);
    if (timeIndex === -1) return;
    if (!occupyData[date] || !occupyData[date][staff]) return;
    // 先清空该预约的所有占用，再重新初始化（避免残留）
    delete occupyData[date][staff];
    initOccupyData();
    // 刷新可视化
    if (adminContent.style.display === 'block') {
        renderStatsTable(statsDate.value);
    }
}

// 预约表单提交
reserveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // 获取表单值
    const petName = document.getElementById('petName').value;
    const petBreed = document.getElementById('petBreed').value;
    const userPhone = document.getElementById('userPhone').value;
    const serviceType = document.getElementById('serviceType').value;
    const washStaff = document.getElementById('washStaff').value;
    const washTime = document.getElementById('washTime').value;
    const date = reserveDate.value;
    const time = reserveTime.value;
    const remark = document.getElementById('remark').value;

    // 校验冲突
    if (checkOccupyConflict(date, washStaff, time, washTime)) {
        alert('该时间段已被占用（含洗护时长联动），请选择其他时间/师傅！');
        return;
    }

    // 构造预约对象
    const newReserve = {
        id: Date.now(),
        petName,
        petBreed,
        userPhone,
        serviceType,
        washStaff,
        washTime,
        date,
        time,
        remark,
        serviceStatus: false
    };

    // 添加预约并标记占用
    reserveList.push(newReserve);
    localStorage.setItem(reserveKey, JSON.stringify(reserveList));
    markOccupyTime(date, washStaff, time, washTime);

    // 重置并刷新
    reserveForm.reset();
    alert('预约提交成功！');
    switchModule('my');
    renderMyReserve();
    renderAdminReserve();
});

// 渲染我的预约列表
function renderMyReserve() {
    if (reserveList.length === 0) {
        myEmptyTip.style.display = 'block';
        myReserveList.innerHTML = '';
        return;
    }
    myEmptyTip.style.display = 'none';
    let html = '';
    reserveList.forEach(item => {
        const statusClass = item.serviceStatus ? 'reserve-item completed' : 'reserve-item';
        const statusText = item.serviceStatus ? '✅ 服务完成' : '⏳ 待服务';
        html += `
            <div class="${statusClass}" data-id="${item.id}">
                <div class="info">
                    <div class="pet">${item.petName}（${item.petBreed}）<span style="color:${item.serviceStatus ? '#27ae60' : '#f39c12'}">${statusText}</span></div>
                    <div class="user">联系电话：${item.userPhone}</div>
                    <div class="remark">备注：${item.remark || '无'}</div>
                </div>
                <div class="service">${item.serviceType}</div>
                <div class="service">${item.washStaff}</div>
                <div class="service">${item.washTime}</div>
                <div class="time">${item.date} ${item.time}</div>
                <button class="del-btn" onclick="delReserve(${item.id})">删除</button>
            </div>
        `;
    });
    myReserveList.innerHTML = html;
}

// 渲染管理员预约列表
function renderAdminReserve() {
    if (reserveList.length === 0) {
        adminEmptyTip.style.display = 'block';
        adminReserveList.innerHTML = '';
        return;
    }
    adminEmptyTip.style.display = 'none';
    let html = '';
    reserveList.forEach(item => {
        const statusClass = item.serviceStatus ? 'reserve-item completed' : 'reserve-item';
        const statusBtn = item.serviceStatus 
            ? `<button class="complete-btn cancel" onclick="changeServiceStatus(${item.id}, false)">取消完成</button>`
            : `<button class="complete-btn" onclick="changeServiceStatus(${item.id}, true)">标记完成</button>`;
        html += `
            <div class="${statusClass}" data-id="${item.id}">
                <div class="info">
                    <div class="pet">${item.petName}（${item.petBreed}）</div>
                    <div class="user">${item.userPhone}</div>
                </div>
                <div class="service">${item.serviceType}</div>
                <div class="service">${item.washStaff}</div>
                <div class="service">${item.washTime}</div>
                <div class="time">${item.date} ${item.time}</div>
                ${statusBtn}
                <button class="del-btn" onclick="delReserve(${item.id})">删除</button>
            </div>
        `;
    });
    adminReserveList.innerHTML = html;
}

// 渲染拖动式可视化统计表格
function renderStatsTable(queryDate) {
    if (!occupyData[queryDate]) occupyData[queryDate] = {};
    staffList.forEach(staff => {
        if (!occupyData[queryDate][staff]) occupyData[queryDate][staff] = {};
        timeList.forEach(time => {
            if (occupyData[queryDate][staff][time] === undefined) {
                occupyData[queryDate][staff][time] = false;
            }
        });
    });

    // 生成表格HTML
    let html = `
        <table id="occupyTable">
            <thead>
                <tr>
                    <th>服务人员/时间段</th>
    `;
    // 表头：时间点
    timeList.forEach(time => {
        html += `<th>${time}</th>`;
    });
    html += `
                </tr>
            </thead>
            <tbody>
    `;
    // 表体：师傅+占用状态
    staffList.forEach((staff, rowIndex) => {
        html += `<tr data-staff="${staff}" data-row="${rowIndex}">
            <td class="staff-cell">${staff}</td>
        `;
        timeList.forEach((time, colIndex) => {
            const isOccupy = occupyData[queryDate][staff][time];
            const bgColor = isOccupy ? '#e74c3c' : '#27ae60';
            html += `<td 
                data-time="${time}" 
                data-col="${colIndex}"
                style="background:${bgColor};color:#fff;font-weight:600;cursor:pointer;"
                title="${isOccupy ? '已占用，右键拖动释放' : '未占用，左键拖动占用'}"
            >${isOccupy ? '●' : '○'}</td>`;
        });
        html += `</tr>`;
    });
    html += `
            </tbody>
        </table>
    `;
    statsTable.innerHTML = html;
}

// 绑定拖动事件（核心）
function bindDragEvent() {
    statsTable.addEventListener('mousedown', (e) => {
        // 排除表头和师傅列
        if (e.target.tagName !== 'TD' || e.target.classList.contains('staff-cell') || e.target.parentElement.tagName === 'THEAD') {
            dragState.isDragging = false;
            return;
        }
        // 区分左键/右键
        dragState.isRightClick = e.button === 2;
        dragState.isDragging = true;
        // 获取起始行列
        dragState.startX = parseInt(e.target.dataset.col);
        dragState.startY = parseInt(e.target.parentElement.dataset.row);
        // 阻止右键默认菜单
        if (dragState.isRightClick) e.preventDefault();
    });

    statsTable.addEventListener('mousemove', (e) => {
        if (!dragState.isDragging) return;
        if (e.target.tagName !== 'TD' || e.target.classList.contains('staff-cell') || e.target.parentElement.tagName === 'THEAD') {
            return;
        }
        // 获取结束行列
        dragState.endX = parseInt(e.target.dataset.col);
        dragState.endY = parseInt(e.target.parentElement.dataset.row);
    });

    document.addEventListener('mouseup', (e) => {
        if (!dragState.isDragging) return;
        // 计算实际选中的行列范围（取最小/最大值，支持任意方向拖动）
        const minX = Math.min(dragState.startX, dragState.endX);
        const maxX = Math.max(dragState.startX, dragState.endX);
        const minY = Math.min(dragState.startY, dragState.endY);
        const maxY = Math.max(dragState.startY, dragState.endY);
        const queryDate = statsDate.value;
        // 遍历选中的单元格，更新占用状态
        const table = document.getElementById('occupyTable');
        for (let y = minY; y <= maxY; y++) {
            const row = table.tBodies[0].rows[y];
            const staff = row.dataset.staff;
            for (let x = minX; x <= maxX; x++) {
                const cell = row.cells[x + 1]; // 跳过师傅列
                const time = cell.dataset.time;
                // 初始化占用数据
                if (!occupyData[queryDate]) occupyData[queryDate] = {};
                if (!occupyData[queryDate][staff]) occupyData[queryDate][staff] = {};
                // 左键=占用（true），右键=释放（false）
                occupyData[queryDate][staff][time] = !dragState.isRightClick;
            }
        }
        // 刷新可视化
        renderStatsTable(queryDate);
        // 重置拖动状态
        dragState = { isDragging: false, startX: -1, startY: -1, endX: -1, endY: -1, isRightClick: false };
    });

    // 阻止可视化区域右键菜单
    statsTable.addEventListener('contextmenu', (e) => e.preventDefault());
}

// 切换服务完成状态
function changeServiceStatus(id, status) {
    const reserveItem = reserveList.find(item => item.id === id);
    if (reserveItem) {
        reserveItem.serviceStatus = status;
        localStorage.setItem(reserveKey, JSON.stringify(reserveList));
        renderMyReserve();
        renderAdminReserve();
        alert(status ? '已标记为服务完成！' : '已取消服务完成状态！');
    }
}

// 删除预约记录（同时释放占用）
function delReserve(id) {
    if (confirm('确定要删除该预约记录吗？删除后将释放对应时间段！')) {
        const delItem = reserveList.find(item => item.id === id);
        if (delItem) {
            // 释放占用的时间点
            releaseOccupyTime(delItem.date, delItem.washStaff, delItem.time, delItem.washTime);
            // 删除预约
            reserveList = reserveList.filter(item => item.id !== id);
            localStorage.setItem(reserveKey, JSON.stringify(reserveList));
            // 刷新列表和可视化
            renderMyReserve();
            renderAdminReserve();
            if (adminContent.style.display === 'block') {
                renderStatsTable(statsDate.value);
            }
        }
    }
}

// 管理员登录
loginBtn.addEventListener('click', () => {
  adminLogin.style.display = 'none';
  adminContent.style.display = 'block';
  renderAdminReserve();
  renderStatsTable(statsDate.value);
});

// 查询统计日期
queryStatsBtn.addEventListener('click', () => {
    if (!statsDate.value) {
        alert('请选择查询日期！');
        return;
    }
    renderStatsTable(statsDate.value);
});

// 回车事件
statsDate.addEventListener('keydown', (e) => { if (e.key === 'Enter') queryStatsBtn.click(); });

// 暴露全局函数
window.delReserve = delReserve;
window.changeServiceStatus = changeServiceStatus;

// 动态添加所有样式
const style = document.createElement('style');
style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Microsoft YaHei", sans-serif; }
    body { background: #f5f7fa; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #333; font-size: 28px; margin-bottom: 20px; }
    .nav { display: flex; justify-content: center; gap: 15px; }
    .nav-btn { padding: 10px 25px; border: 1px solid #eee; border-radius: 6px; background: #fff; color: #333; cursor: pointer; font-size: 16px; transition: all 0.3s; }
    .nav-btn.active { background: #2d9cdb; color: #fff; border-color: #2d9cdb; }
    .module { display: none; }
    .module.active { display: block; }
    .reserve-form { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .form-item { display: flex; flex-direction: column; gap: 8px; }
    .form-item label { font-size: 16px; color: #333; font-weight: 500; }
    .form-item label .required { color: #e74c3c; }
    .form-item input, .form-item select, .form-item textarea { padding: 12px 15px; border: 1px solid #eee; border-radius: 6px; outline: none; font-size: 16px; resize: none; }
    .form-item.double { flex-direction: row; gap: 20px; }
    .form-item.double > div { flex: 1; }
    .submit-btn { padding: 15px; background: #2d9cdb; color: #fff; border: none; border-radius: 6px; font-size: 18px; cursor: pointer; transition: all 0.3s; }
    .submit-btn:hover { background: #258cd1; }
    .reserve-list { margin-top: 20px; display: flex; flex-direction: column; gap: 15px; }
    .reserve-item { padding: 20px; border: 1px solid #eee; border-radius: 8px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .reserve-item.completed { background: #f0f9f2; border-color: #27ae60; }
    .reserve-item .info { flex: 1; min-width: 250px; }
    .reserve-item .info .pet { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px; }
    .reserve-item .info .user, .reserve-item .info .remark { font-size: 14px; color: #666; margin-bottom: 4px; }
    .reserve-item .service, .reserve-item .time { min-width: 100px; text-align: center; font-size: 16px; color: #333; }
    .reserve-item .time { color: #2d9cdb; font-weight: 500; }
    .complete-btn { padding: 8px 12px; background: #27ae60; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px; }
    .complete-btn.cancel { background: #f39c12; }
    .del-btn { padding: 8px 12px; background: #e74c3c; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    .empty-tip { text-align: center; padding: 50px; color: #999; font-size: 16px; }
    .admin-login { max-width: 400px; margin: 0 auto; display: flex; gap: 10px; margin-top: 50px; }
    .admin-login input { flex: 1; padding: 12px 15px; border: 1px solid #eee; border-radius: 6px; outline: none; }
    .login-btn { padding: 0 25px; background: #2d9cdb; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .stats-card { border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .stats-card h3 { color: #333; margin-bottom: 15px; }
    .date-select { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
    .date-select label { font-size: 16px; color: #333; }
    .date-select input { padding: 8px 10px; border: 1px solid #eee; border-radius: 4px; outline: none; }
    .query-btn { padding: 8px 15px; background: #2d9cdb; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    .stats-tips { display: flex; gap: 20px; margin-bottom: 15px; font-size: 14px; color: #666; }
    .stats-table { overflow-x: auto; margin-bottom: 15px; }
    .stats-table table { width: 100%; border-collapse: collapse; text-align: center; }
    .stats-table th, .stats-table td { padding: 12px 5px; border: 1px solid #eee; white-space: nowrap; font-size: 14px; }
    .stats-table .staff-cell { font-weight: 600; background: #f5f7fa; }
    .stats-legend { display: flex; gap: 20px; align-items: center; font-size: 14px; }
    .stats-legend i { display: inline-block; width: 15px; height: 15px; border-radius: 2px; margin-right: 5px; }
    @media (max-width: 768px) {
        .form-item.double { flex-direction: column; gap: 20px; }
        .reserve-item { flex-direction: column; align-items: flex-start; }
        .reserve-item .service, .reserve-item .time { min-width: auto; text-align: left; margin-top: 10px; }
        .stats-tips { flex-direction: column; gap: 10px; }
    }
`;
document.head.appendChild(style);
