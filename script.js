document.addEventListener("DOMContentLoaded", () => {
  const MIN_SIZE = 10;
  const SHIP_LENGTHS = [2, 3, 4, 5];
  const STATUS = {
    EMPTY: 0,
    MISS: 1,
    HIT: 2,
    SUNK: 3,
  };

  const state = {
    rows: MIN_SIZE,
    cols: MIN_SIZE,
    board: [],
    scores: [],
    totalPlacements: 0,
  };

  const rowsInput = document.getElementById("rowsInput");
  const colsInput = document.getElementById("colsInput");
  const calculateBtn = document.getElementById("calculateBtn");
  const resetBtn = document.getElementById("resetBtn");
  const gridEl = document.getElementById("grid");
  const resultsBody = document.getElementById("resultsBody");
  const resultSummary = document.getElementById("resultSummary");
  const boardStats = document.getElementById("boardStats");

  // Khởi tạo bàn cờ và bộ đếm mặc định.
  syncBoardSize(true);
  renderGrid();
  clearResults("Hãy đánh dấu trạng thái bàn cờ rồi bấm Calculate.");

  rowsInput.addEventListener("change", handleSizeChange);
  colsInput.addEventListener("change", handleSizeChange);
  calculateBtn.addEventListener("click", calculateBestMoves);
  resetBtn.addEventListener("click", resetBoard);

  function handleSizeChange() {
    syncBoardSize(true);
    renderGrid();
    clearResults("Đã cập nhật kích thước bàn. Hãy nhập trạng thái mới nếu cần.");
  }

  function syncBoardSize(forceReset = false) {
    const nextRows = normalizeSize(rowsInput.value, state.rows);
    const nextCols = normalizeSize(colsInput.value, state.cols);

    rowsInput.value = nextRows;
    colsInput.value = nextCols;

    const sizeChanged = nextRows !== state.rows || nextCols !== state.cols;
    state.rows = nextRows;
    state.cols = nextCols;

    if (forceReset || sizeChanged || state.board.length === 0) {
      state.board = createMatrix(state.rows, state.cols, STATUS.EMPTY);
      state.scores = createMatrix(state.rows, state.cols, 0);
    }
  }

  function normalizeSize(rawValue, fallbackValue) {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) {
      return Math.max(MIN_SIZE, fallbackValue);
    }
    return Math.max(MIN_SIZE, parsed);
  }

  function createMatrix(rows, cols, fillValue) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fillValue));
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    gridEl.style.gridTemplateColumns = `repeat(${state.cols}, minmax(0, 1fr))`;

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell state-0";
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.short = "";
        cell.title = `Hàng ${row + 1}, Cột ${col + 1} - Chưa mở`;
        cell.setAttribute("aria-label", `Hàng ${row + 1}, Cột ${col + 1}`);
        cell.addEventListener("click", () => cycleCellStatus(row, col));
        gridEl.appendChild(cell);
      }
    }

    paintBoard();
    updateBoardStats();
  }

  function paintBoard(bestCells = new Set()) {
    const cells = gridEl.querySelectorAll(".cell");
    cells.forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const status = state.board[row][col];
      cell.className = `cell state-${status}`;
      cell.classList.toggle("best", bestCells.has(cellKey(row, col)));
      cell.dataset.short = statusShortLabel(status);
      cell.title = `Hàng ${row + 1}, Cột ${col + 1} - ${statusLongLabel(status)}`;
    });
  }

  function statusShortLabel(status) {
    switch (status) {
      case STATUS.MISS:
        return "M";
      case STATUS.HIT:
        return "H";
      case STATUS.SUNK:
        return "S";
      default:
        return "";
    }
  }

  function statusLongLabel(status) {
    switch (status) {
      case STATUS.MISS:
        return "Miss";
      case STATUS.HIT:
        return "Hit";
      case STATUS.SUNK:
        return "Sunk";
      default:
        return "Chưa mở";
    }
  }

  function cycleCellStatus(row, col) {
    state.board[row][col] = (state.board[row][col] + 1) % 4;
    state.scores[row][col] = 0;
    paintBoard();
    clearResults("Bàn cờ đã thay đổi. Bấm Calculate để tính lại xác suất.");
    updateBoardStats();
  }

  function resetBoard() {
    syncBoardSize(false);
    state.board = createMatrix(state.rows, state.cols, STATUS.EMPTY);
    state.scores = createMatrix(state.rows, state.cols, 0);
    paintBoard();
    clearResults("Bàn đã được đặt lại. Sẵn sàng tính toán.");
    updateBoardStats();
  }

  function calculateBestMoves() {
    syncBoardSize(false);
    state.scores = createMatrix(state.rows, state.cols, 0);

    const hitClusters = findHitClusters();
    const hitClusterMap = buildClusterMap(hitClusters);
    const resolvedCellSet = buildResolvedCellSet();
    let totalPlacements = 0;

    // Đếm mật độ cho mọi vị trí tàu hợp lệ theo kích thước 2-5.
    for (const length of SHIP_LENGTHS) {
      totalPlacements += scanPlacements(length, hitClusters, hitClusterMap, resolvedCellSet);
    }

    state.totalPlacements = totalPlacements;

    if (totalPlacements === 0) {
      paintBoard();
      resultsBody.innerHTML = `<tr><td colspan="3" class="empty-state">Không tìm thấy cấu hình hợp lệ. Hãy kiểm tra lại các ô Miss/Hit/Sunk.</td></tr>`;
      resultSummary.textContent = "Bàn cờ hiện tại đang mâu thuẫn với luật đặt tàu. Hãy rà lại các ô đã đánh dấu.";
      boardStats.textContent = "0 cấu hình hợp lệ";
      return;
    }

    const candidates = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.board[row][col] !== STATUS.EMPTY) {
          continue;
        }
        const score = state.scores[row][col];
        if (score <= 0) {
          continue;
        }
        candidates.push({ row, col, score, probability: (score / totalPlacements) * 100 });
      }
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.row !== right.row) {
        return left.row - right.row;
      }
      return left.col - right.col;
    });

    const topFive = candidates.slice(0, 5);
    const bestScore = topFive.length > 0 ? topFive[0].score : 0;
    const bestCells = new Set(
      candidates.filter((candidate) => candidate.score === bestScore).map((candidate) => cellKey(candidate.row, candidate.col)),
    );

    paintBoard(bestCells);
    renderResults(topFive, totalPlacements, candidates.length, bestScore);
    updateBoardStats();
  }

  function scanPlacements(length, hitClusters, hitClusterMap, resolvedCellSet) {
    let validCount = 0;

    for (const orientation of ["horizontal", "vertical"]) {
      const maxRow = orientation === "vertical" ? state.rows - length : state.rows - 1;
      const maxCol = orientation === "horizontal" ? state.cols - length : state.cols - 1;

      for (let row = 0; row <= maxRow; row += 1) {
        for (let col = 0; col <= maxCol; col += 1) {
          const placement = buildPlacement(row, col, length, orientation);
          if (!placementIsValid(placement, hitClusters, hitClusterMap, resolvedCellSet)) {
            continue;
          }

          validCount += 1;
          for (const cell of placement) {
            state.scores[cell.row][cell.col] += 1;
          }
        }
      }
    }

    return validCount;
  }

  function buildPlacement(row, col, length, orientation) {
    const placement = [];

    for (let offset = 0; offset < length; offset += 1) {
      placement.push({
        row: orientation === "vertical" ? row + offset : row,
        col: orientation === "horizontal" ? col + offset : col,
      });
    }

    return placement;
  }

  function placementIsValid(placement, hitClusters, hitClusterMap, resolvedCellSet) {
    const placementSet = new Set(placement.map(({ row, col }) => cellKey(row, col)));
    const touchedClusterIds = new Set();

    for (const cell of placement) {
      const status = state.board[cell.row][cell.col];
      if (status === STATUS.MISS || status === STATUS.SUNK) {
        return false;
      }
      if (status === STATUS.HIT) {
        const clusterId = hitClusterMap.get(cellKey(cell.row, cell.col));
        if (clusterId !== undefined) {
          touchedClusterIds.add(clusterId);
        }
      }
    }

    if (hitClusters.length > 0 && touchedClusterIds.size === 0) {
      return false;
    }

    for (const clusterId of touchedClusterIds) {
      const cluster = hitClusters[clusterId];
      for (const clusterCell of cluster) {
        if (!placementSet.has(cellKey(clusterCell.row, clusterCell.col))) {
          return false;
        }
      }
    }

    if (!noAdjacentConflict(placementSet, resolvedCellSet)) {
      return false;
    }

    return true;
  }

  function noAdjacentConflict(placementSet, resolvedCellSet) {
    for (const key of placementSet) {
      const [row, col] = parseCellKey(key);
      const neighbors = getNeighbors(row, col);

      for (const neighbor of neighbors) {
        const neighborKey = cellKey(neighbor.row, neighbor.col);
        if (placementSet.has(neighborKey)) {
          continue;
        }
        if (resolvedCellSet.has(neighborKey)) {
          return false;
        }
      }
    }

    return true;
  }

  function findHitClusters() {
    const visited = createMatrix(state.rows, state.cols, false);
    const clusters = [];

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (visited[row][col] || state.board[row][col] !== STATUS.HIT) {
          continue;
        }

        const cluster = [];
        const queue = [{ row, col }];
        visited[row][col] = true;

        while (queue.length > 0) {
          const current = queue.shift();
          cluster.push(current);

          for (const neighbor of getOrthogonalNeighbors(current.row, current.col)) {
            if (visited[neighbor.row][neighbor.col]) {
              continue;
            }
            if (state.board[neighbor.row][neighbor.col] !== STATUS.HIT) {
              continue;
            }
            visited[neighbor.row][neighbor.col] = true;
            queue.push(neighbor);
          }
        }

        clusters.push(cluster);
      }
    }

    return clusters;
  }

  function buildClusterMap(hitClusters) {
    const clusterMap = new Map();
    hitClusters.forEach((cluster, clusterId) => {
      cluster.forEach((cell) => {
        clusterMap.set(cellKey(cell.row, cell.col), clusterId);
      });
    });
    return clusterMap;
  }

  function buildResolvedCellSet() {
    const resolved = new Set();

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.board[row][col] === STATUS.HIT || state.board[row][col] === STATUS.SUNK) {
          resolved.add(cellKey(row, col));
        }
      }
    }

    return resolved;
  }

  function getNeighbors(row, col) {
    const neighbors = [];
    for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
      for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
        if (rowDelta === 0 && colDelta === 0) {
          continue;
        }
        const nextRow = row + rowDelta;
        const nextCol = col + colDelta;
        if (!isInsideBoard(nextRow, nextCol)) {
          continue;
        }
        neighbors.push({ row: nextRow, col: nextCol });
      }
    }
    return neighbors;
  }

  function getOrthogonalNeighbors(row, col) {
    return [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ].filter(({ row: nextRow, col: nextCol }) => isInsideBoard(nextRow, nextCol));
  }

  function isInsideBoard(row, col) {
    return row >= 0 && row < state.rows && col >= 0 && col < state.cols;
  }

  function renderResults(topFive, totalPlacements, candidateCount, bestScore) {
    if (topFive.length === 0) {
      resultsBody.innerHTML = `<tr><td colspan="3" class="empty-state">Không có ô trống nào phù hợp để gợi ý.</td></tr>`;
      resultSummary.textContent = `Đã tìm thấy ${totalPlacements} cấu hình hợp lệ nhưng không có ô trống nào cần đánh tiếp.`;
      boardStats.textContent = `${totalPlacements} cấu hình hợp lệ`;
      return;
    }

    resultsBody.innerHTML = topFive
      .map((item) => {
        const label = `Hàng ${item.row + 1}, Cột ${item.col + 1}`;
        return `<tr><td>${label}</td><td>${formatPercent(item.probability)}</td><td>${item.score}</td></tr>`;
      })
      .join("");

    const topLabel = `Hàng ${topFive[0].row + 1}, Cột ${topFive[0].col + 1}`;
    resultSummary.textContent = `Phát hiện ${candidateCount} ô trống có thể đánh. Ô tốt nhất là ${topLabel} với điểm ${bestScore} trên ${totalPlacements} cấu hình hợp lệ.`;
    boardStats.textContent = `${totalPlacements} cấu hình hợp lệ · best ${formatPercent(topFive[0].probability)}`;

    const bestProbability = topFive[0].probability;
    bestCellScoreEl.textContent = formatPercent(bestProbability);
    bestCellLabelEl.textContent = topLabel;
    clearHighlights();
    topFive
      .filter((item) => item.score === bestScore)
      .forEach((item) => {
        const bestCell = gridEl.querySelector(`.cell[data-row="${item.row}"][data-col="${item.col}"]`);
        if (bestCell) {
          bestCell.classList.add("best");
        }
      });
  }

  function formatPercent(value) {
    return `${value.toFixed(1)}%`;
  }

  function clearResults(message) {
    resultSummary.textContent = message;
    resultsBody.innerHTML = `<tr><td colspan="3" class="empty-state">Chưa có dữ liệu.</td></tr>`;
    boardStats.textContent = "Sẵn sàng tính toán";
    paintBoard();
  }

  function updateBoardStats() {
    const counts = countStatuses();
    boardStats.textContent = `Empty ${counts.empty} · Miss ${counts.miss} · Hit ${counts.hit} · Sunk ${counts.sunk}`;
  }

  function countStatuses() {
    const counts = { empty: 0, miss: 0, hit: 0, sunk: 0 };

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        switch (state.board[row][col]) {
          case STATUS.MISS:
            counts.miss += 1;
            break;
          case STATUS.HIT:
            counts.hit += 1;
            break;
          case STATUS.SUNK:
            counts.sunk += 1;
            break;
          default:
            counts.empty += 1;
        }
      }
    }

    return counts;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function parseCellKey(key) {
    const [row, col] = key.split(":").map(Number);
    return [row, col];
  }
});
