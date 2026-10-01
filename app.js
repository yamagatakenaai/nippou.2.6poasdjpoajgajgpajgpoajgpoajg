// GASのウェブアプリURLをセット（localStorageに保存されていればそれを使用、なければ最初は空）
let GAS_URL = localStorage.getItem('gas_url') || '';

document.addEventListener('DOMContentLoaded', () => {
  // Service Worker Registration (for PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Registered'))
      .catch(err => console.log('Service Worker Registration Failed', err));
  }

  // --- 検索関連要素の先行定義（一括変更機能やPIN認証から安全に参照するため） ---
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchBtnText = searchBtn ? searchBtn.querySelector('.btn-text') : null;
  const searchSpinner = searchBtn ? searchBtn.querySelector('.search-spinner') : null;
  const searchResultsEl = document.getElementById('searchResults');
  const searchSection = document.querySelector('.search-section');

  // --- カレンダー関連要素 (v1.9) ---
  const calendarViewBtn = document.getElementById('calendarViewBtn');
  const calendarViewBtnIcon = document.getElementById('calendarViewBtnIcon');
  const calendarViewBtnText = document.getElementById('calendarViewBtnText');
  const calendarContainer = document.getElementById('calendarContainer');
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const calendarMonthTitle = document.getElementById('calendarMonthTitle');
  const calendarGrid = document.getElementById('calendarGrid');
  const backToCalendarBtn = document.getElementById('backToCalendarBtn');
  const searchHelpers = document.querySelector('.search-helpers');

  // --- カレンダー状態管理変数 (v1.9) ---
  let allNippouData = null;
  let isCalendarMode = false;
  let calendarCurrentYear = new Date().getFullYear();
  let calendarCurrentMonth = new Date().getMonth(); // 0-11

  // --- 写真関連要素と状態変数 (v2.1.2 統合対応) ---
  const photoFolderIdInput = document.getElementById('photoFolderIdInput');
  const photoAddBtn = document.getElementById('photoAddBtn');
  const photoSourceModal = document.getElementById('photoSourceModal');
  const modalCameraBtn = document.getElementById('modalCameraBtn');
  const modalGalleryBtn = document.getElementById('modalGalleryBtn');
  const closePhotoSourceModalBtn = document.getElementById('closePhotoSourceModalBtn');
  const cameraInput = document.getElementById('cameraInput');
  const galleryInput = document.getElementById('galleryInput');
  const photoPreviewContainer = document.getElementById('photoPreviewContainer');
  
  const photoModal = document.getElementById('photoModal');
  const closePhotoModalBtn = document.getElementById('closePhotoModalBtn');
  const photoModalSpinner = document.getElementById('photoModalSpinner');
  const photoModalImage = document.getElementById('photoModalImage');
  const photoModalDriveLink = document.getElementById('photoModalDriveLink');
  
  // v2.1 複数写真ポップアップ追加要素
  const prevPhotoBtn = document.getElementById('prevPhotoBtn');
  const nextPhotoBtn = document.getElementById('nextPhotoBtn');
  const photoModalBadge = document.getElementById('photoModalBadge');

  let selectedImages = [];     // 各要素: { data: 'base64...', name: 'photo.jpg', isNew: true } または { id: 'drive_id', name: 'photo.jpg', isExisting: true }
  let hasImageUpdate = false;  // 画像に変更（追加・更新・削除）があったかどうかのフラグ
  let photoFolderId = localStorage.getItem('photo_folder_id') || '';

  let activeModalImages = [];  // モーダル表示中の画像IDの配列
  let activeModalIndex = 0;    // 現在表示中の画像インデックス

  // --- テーマ（ダークモード）設定機能 ---
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  
  // OSのデフォルト設定チェックとローカルストレージからの読み込み
  const getPreferredTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  
  const setTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      themeIcon.textContent = 'light_mode';
    } else {
      document.body.classList.remove('dark-theme');
      themeIcon.textContent = 'dark_mode';
    }
    localStorage.setItem('theme', theme);
  };
  
  // 初回ロード時にテーマを反映
  setTheme(getPreferredTheme());
  
  // トグルボタンで切り替え
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    setTheme(isDark ? 'light' : 'dark');
  });

  // --- 更新履歴モーダル ---
  const historyBtn = document.getElementById('historyBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyModal = document.getElementById('historyModal');

  if (historyBtn && historyModal && closeHistoryBtn) {
    historyBtn.addEventListener('click', () => {
      historyModal.style.display = 'flex';
    });
    closeHistoryBtn.addEventListener('click', () => {
      historyModal.style.display = 'none';
    });
    // モーダル外の灰色部分クリックで閉じる
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        historyModal.style.display = 'none';
      }
    });
  }

  // --- 設定モーダル ---
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const gasUrlInput = document.getElementById('gasUrlInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  if (settingsBtn && settingsModal && closeSettingsBtn && gasUrlInput && saveSettingsBtn) {
    // 設定ボタンを押した時にモーダルを開く
    settingsBtn.addEventListener('click', () => {
      // 現在のGAS_URLを入力欄にセット
      gasUrlInput.value = GAS_URL;
      // 現在の写真フォルダIDをセット (v2.0)
      if (photoFolderIdInput) photoFolderIdInput.value = photoFolderId;
      
      // 現在の使用者を設定画面のラジオボタンに反映
      const currentAuthor = localStorage.getItem('nippou_author');
      if (currentAuthor) {
        const authorRadio = document.querySelector(`input[name="settingsAuthor"][value="${currentAuthor}"]`);
        if (authorRadio) authorRadio.checked = true;
      } else {
        const settingsAuthorRadios = document.querySelectorAll('input[name="settingsAuthor"]');
        settingsAuthorRadios.forEach(r => r.checked = false);
      }
      
      settingsModal.style.display = 'flex';
    });

    // 閉じるボタン
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    // 保存ボタン
    saveSettingsBtn.addEventListener('click', () => {
      const newUrl = gasUrlInput.value.trim();
      if (!newUrl) {
        alert('URLを入力してください。');
        return;
      }
      if (!newUrl.startsWith('https://script.google.com/')) {
        if (!confirm('入力されたURLはGoogle Apps ScriptのURL（https://script.google.com/...）ではない可能性がありますが、保存しますか？')) {
          return;
        }
      }
      
      // 選択された使用者を取得
      const selectedAuthorRadio = document.querySelector('input[name="settingsAuthor"]:checked');
      if (!selectedAuthorRadio) {
        alert('使用者を選択してください。');
        return;
      }
      const newAuthor = selectedAuthorRadio.value;
      
      // 写真フォルダIDの取得 (v2.0)
      const newFolderId = photoFolderIdInput ? photoFolderIdInput.value.trim() : '';
      
      // localStorageに保存し、メモリ内の変数も更新
      localStorage.setItem('gas_url', newUrl);
      localStorage.setItem('nippou_author', newAuthor);
      localStorage.setItem('photo_folder_id', newFolderId);
      GAS_URL = newUrl;
      photoFolderId = newFolderId;
      
      settingsModal.style.display = 'none';
      showMessage('設定を保存しました！', 'success');
    });

    // モーダル外クリックで閉じる
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });
  }

  // --- 状況一括変更機能 ---
  const bulkEditBtn = document.getElementById('bulkEditBtn');
  const cancelBulkBtn = document.getElementById('cancelBulkBtn');
  const bulkModal = document.getElementById('bulkModal');
  const closeBulkModalBtn = document.getElementById('closeBulkModalBtn');
  const bulkCheckedCount = document.getElementById('bulkCheckedCount');
  
  let bulkEditMode = false;

  const exitBulkEditMode = () => {
    bulkEditMode = false;
    searchResultsEl.classList.remove('bulk-mode-active');
    cancelBulkBtn.classList.add('hidden');
    
    const btnIcon = document.getElementById('bulkEditBtnIcon');
    const btnText = document.getElementById('bulkEditBtnText');
    if (btnIcon) btnIcon.textContent = 'rule';
    if (btnText) btnText.textContent = '一括変更';
    
    // 全チェックボックスをクリアしてスタイルをリセット
    const checkBoxes = document.querySelectorAll('.bulk-checkbox');
    checkBoxes.forEach(cb => {
      cb.checked = false;
      const card = cb.closest('.result-card');
      if (card) card.classList.remove('bulk-selected');
    });
  };

  const updateBulkEditBtnState = () => {
    const checkedBoxes = document.querySelectorAll('.bulk-checkbox:checked');
    const btnText = document.getElementById('bulkEditBtnText');
    const btnIcon = document.getElementById('bulkEditBtnIcon');
    
    if (checkedBoxes.length > 0) {
      if (btnText) btnText.textContent = '更新する';
      if (btnIcon) btnIcon.textContent = 'done_all';
    } else {
      if (btnText) btnText.textContent = '一括変更';
      if (btnIcon) btnIcon.textContent = 'rule';
    }
  };

  if (bulkEditBtn && cancelBulkBtn && bulkModal && closeBulkModalBtn) {
    // 一括変更 / 更新する ボタンクリック
    bulkEditBtn.addEventListener('click', () => {
      // カレンダーモード中なら強制解除する (v1.9)
      if (isCalendarMode) {
        toggleCalendarMode(false);
      }

      if (!bulkEditMode) {
        // モードをONにする
        bulkEditMode = true;
        searchResultsEl.classList.add('bulk-mode-active');
        cancelBulkBtn.classList.remove('hidden');
        updateBulkEditBtnState();
      } else {
        // すでにONの場合、チェックされた数を調べる
        const checkedBoxes = document.querySelectorAll('.bulk-checkbox:checked');
        if (checkedBoxes.length === 0) {
          // チェックがなければモードOFFにする
          exitBulkEditMode();
        } else {
          // チェックがあれば一括変更モーダルを開く
          if (!GAS_URL) {
            showMessage('先に右上の設定（歯車）ボタンから、GASのURLを設定してください。', 'error');
            return;
          }
          if (bulkCheckedCount) {
            bulkCheckedCount.textContent = checkedBoxes.length;
          }
          bulkModal.style.display = 'flex';
        }
      }
    });

    // キャンセルボタン
    cancelBulkBtn.addEventListener('click', exitBulkEditMode);

    // モーダル閉じる
    closeBulkModalBtn.addEventListener('click', () => {
      bulkModal.style.display = 'none';
    });
    bulkModal.addEventListener('click', (e) => {
      if (e.target === bulkModal) {
        bulkModal.style.display = 'none';
      }
    });

    // モーダル内の状況選択オプションクリック
    const bulkStatusOpts = document.querySelectorAll('.bulk-status-opt');
    bulkStatusOpts.forEach(opt => {
      opt.addEventListener('click', async () => {
        const newStatus = opt.getAttribute('data-status');
        const checkedBoxes = document.querySelectorAll('.bulk-checkbox:checked');
        if (checkedBoxes.length === 0) return;

        if (!confirm(`${checkedBoxes.length}件の日報の状況を一括で変更しますか？`)) {
          return;
        }

        bulkModal.style.display = 'none';
        
        // ローディング
        showMessage('状況を一括変更中...', 'success');
        
        // 送信データの配列作成
        const promises = Array.from(checkedBoxes).map(cb => {
          const rowId = cb.getAttribute('data-row');
          const dateVal = cb.getAttribute('data-date');
          const timeVal = cb.getAttribute('data-time');
          const clientVal = cb.getAttribute('data-client') || '';
          const originalContent = cb.getAttribute('data-content') || '';

          // contentの末尾のタグ（[!] / [#] / [$]）を新しいタグに書き換える
          let newContent = originalContent.trim();
          if (newContent.endsWith('[!]') || newContent.endsWith('[#]') || newContent.endsWith('[$]')) {
            newContent = newContent.substring(0, newContent.length - 3) + newStatus;
          } else {
            newContent = newContent + ' ' + newStatus;
          }

          const urlEncodedData = new URLSearchParams();
          urlEncodedData.append('action', 'update');
          urlEncodedData.append('row', rowId);
          urlEncodedData.append('date', dateVal);
          urlEncodedData.append('time', timeVal);
          urlEncodedData.append('client', clientVal);
          urlEncodedData.append('content', newContent);

          return fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: urlEncodedData.toString()
          }).then(res => {
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            return res.json();
          });
        });

        try {
          const results = await Promise.all(promises);
          const failedCount = results.filter(r => r.status !== 'success').length;
          
          if (failedCount === 0) {
            showMessage('状況の一括変更が完了しました！', 'success');
          } else {
            showMessage(`一部の更新に失敗しました (${failedCount}件の失敗)`, 'error');
          }
          
          allNippouData = null; // キャッシュクリア (v1.9)
          exitBulkEditMode();
          // 自動で現在の検索ワードで再検索して画面を更新
          searchForm.dispatchEvent(new Event('submit'));
        } catch (err) {
          console.error(err);
          showMessage('一括更新の送信中にエラーが発生しました。', 'error');
        }
      });
    });

    // 検索結果一覧内でのチェックボックスやカードクリック制御（イベントデリゲーション）
    searchResultsEl.addEventListener('change', (e) => {
      const cb = e.target.closest('.bulk-checkbox');
      if (cb) {
        const card = cb.closest('.result-card');
        if (card) {
          if (cb.checked) {
            card.classList.add('bulk-selected');
          } else {
            card.classList.remove('bulk-selected');
          }
        }
        updateBulkEditBtnState();
      }
    });
  }

  // --- カード拡大表示機能用ロジック ---
  const cardModal = document.getElementById('cardModal');
  const expandedCardContainer = document.getElementById('expandedCardContainer');

  const openCardModal = (cardElement) => {
    if (!cardModal || !expandedCardContainer) return;

    // カードのクラス（枠線の色など）を引き継ぐ
    const isProgress = cardElement.classList.contains('border-progress');
    const isMemo = cardElement.classList.contains('border-memo');
    let cardThemeClass = '';
    if (isProgress) cardThemeClass = 'border-progress';
    else if (isMemo) cardThemeClass = 'border-memo';

    // 閉じる×ボタンHTML
    const modalCloseBtnHtml = `<button type="button" class="expanded-close-btn" id="closeCardModalBtn"><span class="material-symbols-rounded">close</span></button>`;

    // 拡大表示用カードの構築
    expandedCardContainer.innerHTML = `<div class="result-card expanded-state ${cardThemeClass}">${cardElement.innerHTML} ${modalCloseBtnHtml}</div>`;

    // モーダルを表示
    cardModal.style.display = 'flex';

    // ×ボタンのクリックイベント
    const closeCardModalBtn = document.getElementById('closeCardModalBtn');
    if (closeCardModalBtn) {
      closeCardModalBtn.addEventListener('click', closeCardModal);
    }
  };

  const closeCardModal = () => {
    if (cardModal) {
      cardModal.style.display = 'none';
    }
    if (expandedCardContainer) {
      expandedCardContainer.innerHTML = '';
    }
  };

  if (cardModal) {
    // 背景タップで閉じる
    cardModal.addEventListener('click', (e) => {
      if (e.target === cardModal) {
        closeCardModal();
      }
    });
  }

  // --- PINコード認証機能 ---
  const CORRECT_PIN = '8005';
  let enteredPin = '';
  
  const pinOverlay = document.getElementById('pinOverlay');
  const appContainer = document.getElementById('appContainer');
  const pinDots = document.querySelectorAll('.pin-dot');
  const pinBtns = document.querySelectorAll('.pin-btn[data-val]');
  const pinClearBtn = document.getElementById('pinClearBtn');
  const pinErrorMsg = document.getElementById('pinErrorMsg');

  // ローカルストレージに認証フラグがあるかチェック
  if (localStorage.getItem('nippou_auth_passed') === 'true') {
    pinOverlay.style.display = 'none';
    appContainer.style.display = 'block';
  } else {
    // 認証されていない場合は画面を見せないようにする
    appContainer.style.display = 'none';
  }

  const updatePinDisplay = () => {
    pinDots.forEach((dot, index) => {
      if (index < enteredPin.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });

    if (enteredPin.length === 4) {
      checkPin();
    }
  };

  const checkPin = () => {
    if (enteredPin === CORRECT_PIN) {
      // 成功時
      pinErrorMsg.classList.add('hidden');
      localStorage.setItem('nippou_auth_passed', 'true'); // 今後スキップ
      
      // ふわっと消えるアニメーション
      pinOverlay.style.opacity = '0';
      setTimeout(() => {
        pinOverlay.style.display = 'none';
        appContainer.style.display = 'block';
        // メイン画面のふわっと表示
        appContainer.style.animation = 'fadeIn 0.5s ease-out both';
      }, 500);
      
    } else {
      // 失敗時
      pinErrorMsg.classList.remove('hidden');
      enteredPin = '';
      
      // エラー表示にアニメーションを追加するため一度クラスを消して再度付与
      pinErrorMsg.style.animation = 'none';
      void pinErrorMsg.offsetWidth; // リフローを強制
      pinErrorMsg.style.animation = null;
      
      setTimeout(updatePinDisplay, 400); // 少し待ってからドットをクリア
    }
  };

  pinBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (enteredPin.length < 4) {
        enteredPin += btn.getAttribute('data-val');
        pinErrorMsg.classList.add('hidden');
        updatePinDisplay();
      }
    });
  });

  pinClearBtn.addEventListener('click', () => {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      pinErrorMsg.classList.add('hidden');
      updatePinDisplay();
    }
  });


  // --- フォーム送信・編集機能 ---
  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('time');
  const form = document.getElementById('nippouForm');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitSpinner = document.getElementById('submitSpinner');
  const submitIcon = document.getElementById('submitIcon');
  const messageEl = document.getElementById('message');
  
  const editRowInput = document.getElementById('editRow');
  const editActionInput = document.getElementById('editAction');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // 日付と時刻の初期セット（アプリを開いた現在の時刻）
  const setCurrentDateTime = () => {
    const now = new Date();
    // YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;

    // HH:MM
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hours}:${minutes}`;
  };

  setCurrentDateTime();

  // 編集モードを終了して新規追加モードに戻る
  const resetToInsertMode = () => {
    editRowInput.value = '';
    editActionInput.value = 'insert';
    const editAuthorInput = document.getElementById('editAuthor');
    if (editAuthorInput) editAuthorInput.value = '';
    submitBtnText.textContent = '送信する';
    submitIcon.textContent = 'send';
    cancelEditBtn.classList.add('hidden');
    
    document.getElementById('client').value = '';
    document.getElementById('content').value = '';
    const radios = document.querySelectorAll('input[name="status"]');
    radios.forEach(r => r.checked = false);
    setCurrentDateTime();

    // 写真プレビューもクリア (v2.0)
    clearPhotoSelection();
  };

  cancelEditBtn.addEventListener('click', resetToInsertMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!GAS_URL) {
      showMessage('先に右上の設定（歯車）ボタンから、GASのURLを設定してください。', 'error');
      return;
    }

    // 送信ボタンを無効化してスピナーを表示
    submitBtn.disabled = true;
    submitBtnText.style.display = 'none';
    if(submitIcon) submitIcon.style.display = 'none';
    submitSpinner.style.display = 'block';
    
    messageEl.classList.add('hidden');
    messageEl.className = 'message hidden';
    
    // 入力データの取得
    const formData = new FormData(form);
    const action = formData.get('action'); // "insert" または "update"
    const row = formData.get('row');
    let date = formData.get('date');
    if (date) date = date.replace(/-/g, '/'); // YYYY-MM-DD フォーマットを YYYY/MM/DD に変換して送信する
    const time = formData.get('time');
    const client = formData.get('client');
    const status = formData.get('status');
    
    // 担当者の決定（新規なら設定画面の設定値、訂正なら元の値を維持）
    let author = '';
    if (action === 'insert') {
      author = localStorage.getItem('nippou_author') || '';
      if (!author) {
        showMessage('先に右上の設定（歯車）ボタンから、使用者を設定してください。', 'error');
        // ボタンの状態を元に戻す
        submitBtn.disabled = false;
        submitBtnText.style.display = 'block';
        if(submitIcon) submitIcon.style.display = 'block';
        submitSpinner.style.display = 'none';
        return;
      }
    } else {
      author = document.getElementById('editAuthor').value || '';
      if (!author) {
        author = localStorage.getItem('nippou_author') || '';
      }
    }
    
    const baseContent = formData.get('content');

    // 「担当者」と「状況タグ」を内容の末尾に足す (編集時は2重にならないように処理)
    let finalContent = baseContent.trim();
    
    // タグの除去（万が一含まれていた場合）
    if (finalContent.endsWith('[!]') || finalContent.endsWith('[#]')) {
      finalContent = finalContent.substring(0, finalContent.length - 3).trim();
    }
    // 担当者の除去（万が一含まれていた場合）
    const authorsList = ['社長', '伸明', '横澤'];
    for (const a of authorsList) {
      if (finalContent.endsWith(a)) {
        finalContent = finalContent.substring(0, finalContent.length - a.length).trim();
        break;
      }
    }
    
    finalContent = `${finalContent}\n${author} ${status}`;

    // POST用パラメータ作成
    const urlEncodedData = new URLSearchParams();
    urlEncodedData.append('action', action);
    if (row) urlEncodedData.append('row', row);
    urlEncodedData.append('date', date);
    urlEncodedData.append('time', time);
    urlEncodedData.append('client', client);
    urlEncodedData.append('content', finalContent);

    // 写真のパラメータを追加 (v2.1 複数対応)
    urlEncodedData.append('folderId', photoFolderId);
    urlEncodedData.append('hasImageUpdate', hasImageUpdate ? 'true' : 'false');
    if (hasImageUpdate) {
      const existingIds = selectedImages
        .filter(img => img.isExisting)
        .map(img => img.id)
        .join(',');
      const newImages = selectedImages
        .filter(img => img.isNew)
        .map(img => ({ data: img.data, name: img.name }));
      
      urlEncodedData.append('existingImageIds', existingIds);
      urlEncodedData.append('newImages', JSON.stringify(newImages));
    }

    try {
      // GASへPOSTリクエストを送信
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: urlEncodedData.toString()
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status === 'success') {
        showMessage(action === 'update' ? '日報を訂正（上書き）しました！' : '日報を送信しました！', 'success');
        allNippouData = null; // キャッシュクリア (v1.9)
        resetToInsertMode();
        
        // 写真添付プレビューと状態をクリア (v2.0)
        clearPhotoSelection();
        
        // もし検索中なら自動で再検索する
        if (searchResultsEl.innerHTML.trim() !== '' && searchInput.value.trim() !== '') {
          searchForm.dispatchEvent(new Event('submit'));
        }
      } else {
        throw new Error(result.message || '送信に失敗しました');
      }

    } catch (error) {
      console.error('Error:', error);
      showMessage(error.message || '送信に失敗しました。', 'error');
    } finally {
      // ボタンの状態を元に戻す
      submitBtn.disabled = false;
      submitBtnText.style.display = 'block';
      if(submitIcon) submitIcon.style.display = 'block';
      submitSpinner.style.display = 'none';
    }
  });

  // メッセージ表示用関数
  function showMessage(msg, type) {
    messageEl.textContent = msg;
    messageEl.classList.add(type);
    messageEl.classList.remove('hidden');
    
    if (type === 'success') {
      setTimeout(() => {
        messageEl.classList.add('hidden');
      }, 5000);
    }
  }

  // --- 検索機能 ---
  
  const searchProgressBtn = document.getElementById('searchProgressBtn');
  const searchTodayBtn = document.getElementById('searchTodayBtn');
  const searchCalendarBtn = document.getElementById('searchCalendarBtn');
  const searchDateInput = document.getElementById('searchDateInput');

  // 継続中検索ボタンのイベント
  if (searchProgressBtn) {
    searchProgressBtn.addEventListener('click', () => {
      searchInput.value = '[#]';
      // 自動で検索を実行
      searchForm.dispatchEvent(new Event('submit'));
    });
  }

  // メモ検索ボタンのイベント
  const searchMemoBtn = document.getElementById('searchMemoBtn');
  if (searchMemoBtn) {
    searchMemoBtn.addEventListener('click', () => {
      searchInput.value = '[$]';
      // 自動で検索を実行
      searchForm.dispatchEvent(new Event('submit'));
    });
  }

  // 当日検索ボタンのイベント
  if (searchTodayBtn) {
    searchTodayBtn.addEventListener('click', () => {
      const now = new Date();
      // YYYY/MM/DDの形式に整形
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      
      searchInput.value = `${y}/${m}/${d}`;
      // 自動で検索を実行
      searchForm.dispatchEvent(new Event('submit'));
    });
  }

  // カレンダー入力のイベント（日付が選択されたら自動入力して検索）
  if (searchDateInput) {
    searchDateInput.addEventListener('change', (e) => {
      const val = e.target.value; // YYYY-MM-DD
      if (val) {
        searchInput.value = val.replace(/-/g, '/'); // 検索形式は YYYY/MM/DD
        // 自動で検索を実行
        searchForm.dispatchEvent(new Event('submit'));
        // 連続使用のために一度リセットしておく
        e.target.value = '';
      }
    });
  }

  // 日付文字列を YYYY/MM/DD に整形
  function formatDateString(val) {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    } catch(e) {
      return String(val);
    }
  }

  // 時刻文字列を HH:MM に整形（GASでのDate型などから）
  function formatTimeString(val) {
    if (!val) return '';
    if (typeof val === 'string' && val.includes(':')) {
      if (val.includes('T')) {
        const timePart = val.split('T')[1].split(':');
        return `${timePart[0]}:${timePart[1]}`;
      }
      return val.substring(0, 5);
    }
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch(e) {
      return String(val);
    }
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!GAS_URL) {
      searchResultsEl.innerHTML = '<div class="no-results" style="color: #991B1B;"><span class="material-symbols-rounded icon-md">error</span>先に右上の設定（歯車）ボタンから、GASのURLを設定してください。</div>';
      return;
    }
    
    // 検索実行時に一括変更モードを強制解除
    if (typeof exitBulkEditMode === 'function') {
      exitBulkEditMode();
    }
    
    let keyword = searchInput.value.trim();
    if (!keyword) return;

    // UI状態更新：検索中
    searchBtn.disabled = true;
    searchBtnText.style.display = 'none';
    searchSpinner.style.display = 'block';
    searchResultsEl.innerHTML = '';

    try {
      // GASへGETリクエスト（CORS対策としてfetchを使用しパラメータを付与）
      const response = await fetch(`${GAS_URL}?keyword=${encodeURIComponent(keyword)}`);
      
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();
      
      if (data.status === 'success') {
        renderSearchResults(data.results);
      } else {
        throw new Error(data.message || '検索に失敗しました');
      }
    } catch (error) {
      console.error('Search Error:', error);
      searchResultsEl.innerHTML = `<div class="no-results" style="color: #991B1B;">エラーが発生しました: ${error.message}</div>`;
    } finally {
      searchBtn.disabled = false;
      searchBtnText.style.display = 'block';
      searchSpinner.style.display = 'none';
    }
  });

  function renderSearchResults(results) {
    if (!results || results.length === 0) {
      searchResultsEl.innerHTML = '<div class="no-results fade-in"><span class="material-symbols-rounded icon-md">search_off</span>検索結果が見つかりませんでした。</div>';
      return;
    }

    // 新しいものが上に来るように逆順
    const html = results.reverse().map((result, index) => {
      // resultにはGAS側から `row` が渡される前提
      const rowId = result.row || '';
      
      const dateStr = formatDateString(result.date) || '日付なし';
      const timeStr = formatTimeString(result.time) || '';
      const animDelay = (index * 0.05).toFixed(2);
      
      // HTML属性用のエスケープ処理（改行やダブルクォーテーション対応）
      const escapeHtmlAttr = (str) => {
        if (!str) return '';
        return String(str)
          .replace(/"/g, '&quot;')
          .replace(/\n/g, '&#10;')
          .replace(/\r/g, '&#13;');
      };
      
      // 継続中およびメモタグの判定
      const hasProgressTag = (result.content || '').includes('[#]');
      const hasMemoTag = (result.content || '').includes('[$]');
      
      let cardClass = 'result-card fade-in';
      if (hasProgressTag) {
        cardClass = 'result-card border-progress fade-in';
      } else if (hasMemoTag) {
        cardClass = 'result-card border-memo fade-in';
      }
      
      return `
        <div class="${cardClass}" style="animation-delay: ${animDelay}s" data-card-row="${rowId}" data-image-id="${result.imageId || ''}">
          <div class="result-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <!-- 一括変更用チェックボックス -->
              <div class="bulk-check-wrapper">
                <input type="checkbox" class="bulk-checkbox" 
                       data-row="${rowId}" 
                       data-date="${escapeHtmlAttr(result.date)}" 
                       data-time="${escapeHtmlAttr(result.time)}" 
                       data-client="${escapeHtmlAttr(result.client)}" 
                       data-content="${escapeHtmlAttr(result.content)}"
                       data-image-id="${result.imageId || ''}">
              </div>
              <div class="result-datetime" style="display: flex; align-items: center; gap: 0.25rem;">
                <span class="material-symbols-rounded icon-xs">calendar_clock</span>
                <span>${dateStr} ${timeStr}</span>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              ${result.imageId ? `<button type="button" class="photo-btn" data-image-id="${result.imageId}"><span class="material-symbols-rounded icon-xs">photo_camera</span>写真</button>` : ''}
              ${rowId ? `<button type="button" class="delete-btn" data-row="${rowId}" data-image-id="${result.imageId || ''}"><span class="material-symbols-rounded icon-xs">delete</span>削除</button>` : ''}
              ${rowId && hasProgressTag ? `<button type="button" class="done-btn" data-row="${rowId}" data-date="${escapeHtmlAttr(result.date)}" data-time="${escapeHtmlAttr(result.time)}" data-client="${escapeHtmlAttr(result.client)}" data-content="${escapeHtmlAttr(result.content)}"><span class="material-symbols-rounded icon-xs">check_circle</span>完了</button>` : ''}
              ${rowId ? `<button type="button" class="edit-btn" data-row="${rowId}" data-date="${escapeHtmlAttr(result.date)}" data-time="${escapeHtmlAttr(result.time)}" data-client="${escapeHtmlAttr(result.client)}" data-content="${escapeHtmlAttr(result.content)}" data-image-id="${result.imageId || ''}"><span class="material-symbols-rounded icon-xs">edit</span>訂正</button>` : ''}
            </div>
          </div>
          <div class="result-client">
            <span class="material-symbols-rounded icon-sm">person</span>
            ${result.client || '（得意先情報なし）'}
          </div>
          <div class="result-content">${result.content || ''}</div>
        </div>
      `;
    }).join('');

    searchResultsEl.innerHTML = html;
  }
  
  // 訂正・完了ボタンのクリックイベント ＆ カード拡大表示（イベントデリゲーション）
  // --- 日報のアクション共通処理 (v2.1 拡大表示時のボタン対応) ---
  const handlePhotoAction = (imageId) => {
    if (imageId) {
      openPhotoModal(imageId);
    }
  };

  const handleDoneAction = async (rowId, dateVal, timeVal, clientVal, contentVal, doneBtn) => {
    if (!confirm('この日報を完了に変更しますか？')) return;
    
    if (!GAS_URL) {
      showMessage('先に右上の設定（歯車）ボタンから、GASのURLを設定してください。', 'error');
      return;
    }
    
    const dateFormatted = formatDateString(dateVal); // YYYY/MM/DDに整形
    const timeFormatted = formatTimeString(timeVal);
    let contentFormatted = contentVal || '';
    contentFormatted = contentFormatted.replace(/\[#\]/g, '[!]');
    
    const originalText = doneBtn.innerHTML;
    doneBtn.innerHTML = '<span class="material-symbols-rounded icon-xs">sync</span>更新中';
    doneBtn.disabled = true;
    
    try {
      const urlEncodedData = new URLSearchParams();
      urlEncodedData.append('action', 'update');
      urlEncodedData.append('row', rowId);
      urlEncodedData.append('date', dateFormatted);
      urlEncodedData.append('time', timeFormatted);
      urlEncodedData.append('client', clientVal || '');
      urlEncodedData.append('content', contentFormatted);

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlEncodedData.toString()
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const result = await response.json();
      
      if (result.status === 'success') {
        showMessage('日報を完了状態に変更しました！', 'success');
        allNippouData = null; // キャッシュクリア (v1.9)
        searchForm.dispatchEvent(new Event('submit'));
      } else {
        throw new Error(result.message || '更新に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showMessage('完了の更新に失敗しました。', 'error');
      doneBtn.innerHTML = originalText;
      doneBtn.disabled = false;
    }
  };

  const handleEditAction = (rowId, dateVal, timeVal, clientVal, contentVal, imageIdVal) => {
    startEditing(rowId, dateVal, timeVal, clientVal, contentVal, imageIdVal);
  };

  const handleDeleteAction = async (rowId, imageId, deleteBtn) => {
    if (!confirm('この日報を削除しますか？\n（スプレッドシートから完全に削除されます）')) return;

    if (!GAS_URL) {
      showMessage('先に右上の設定（歯車）ボタンから、GASのURLを設定してください。', 'error');
      return;
    }

    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '<span class="material-symbols-rounded icon-xs">sync</span>削除中';
    deleteBtn.disabled = true;

    try {
      const urlEncodedData = new URLSearchParams();
      urlEncodedData.append('action', 'delete');
      urlEncodedData.append('row', rowId);
      if (imageId) urlEncodedData.append('imageId', imageId);

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlEncodedData.toString()
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const result = await response.json();

      if (result.status === 'success') {
        if (result.action && result.action !== 'delete') {
          throw new Error('GASが古いバージョンのまま実行されています。スプレッドシートのGASエディタでv7コードを貼り付け、「デプロイを管理」から【新バージョン】として再デプロイしてください。');
        }
        showMessage('日報を削除しました！', 'success');
        allNippouData = null; // キャッシュクリア
        if (typeof closeCardModal === 'function') closeCardModal();

        // カレンダー表示モード中ならカレンダー再描画
        if (isCalendarMode) {
          loadAllNippouData().then(nippous => {
            renderCalendar(calendarCurrentYear, calendarCurrentMonth, nippous);
          });
        } else {
          // 検索一覧の再検索
          searchForm.dispatchEvent(new Event('submit'));
        }
      } else {
        throw new Error(result.message || '削除に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showMessage(err.message || '削除処理に失敗しました。', 'error');
      deleteBtn.innerHTML = originalText;
      deleteBtn.disabled = false;
    }
  };

  searchResultsEl.addEventListener('click', async (e) => {
    // 一括変更モード中は拡大表示や個別ボタン処理は無効化する
    if (typeof bulkEditMode !== 'undefined' && bulkEditMode) return;

    // --- 写真ボタン処理 ---
    const photoBtn = e.target.closest('.photo-btn');
    if (photoBtn) {
      handlePhotoAction(photoBtn.getAttribute('data-image-id'));
      return;
    }

    // --- 削除ボタン処理 ---
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const rowId = deleteBtn.getAttribute('data-row');
      const imageId = deleteBtn.getAttribute('data-image-id') || '';
      await handleDeleteAction(rowId, imageId, deleteBtn);
      return;
    }

    // --- 完了ボタン処理 ---
    const doneBtn = e.target.closest('.done-btn');
    if (doneBtn) {
      const rowId = doneBtn.getAttribute('data-row');
      const dateVal = doneBtn.getAttribute('data-date');
      const timeVal = doneBtn.getAttribute('data-time');
      const clientVal = doneBtn.getAttribute('data-client') || '';
      const contentVal = doneBtn.getAttribute('data-content') || '';
      await handleDoneAction(rowId, dateVal, timeVal, clientVal, contentVal, doneBtn);
      return;
    }

    // --- 訂正ボタン処理 ---
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
      const rowId = editBtn.getAttribute('data-row');
      const dateVal = editBtn.getAttribute('data-date');
      const timeVal = editBtn.getAttribute('data-time');
      const clientVal = editBtn.getAttribute('data-client');
      const contentVal = editBtn.getAttribute('data-content');
      const imageIdVal = editBtn.getAttribute('data-image-id') || '';
      handleEditAction(rowId, dateVal, timeVal, clientVal, contentVal, imageIdVal);
      return;
    }

    // --- カード本体のタップ（拡大ポップアップ表示） ---
    const card = e.target.closest('.result-card');
    if (card) {
      openCardModal(card);
    }
  });

  // カード拡大表示（詳細モーダル）内でのボタンクリックイベント監視 (v2.1)
  if (expandedCardContainer) {
    expandedCardContainer.addEventListener('click', async (e) => {
      // 写真ボタン
      const photoBtn = e.target.closest('.photo-btn');
      if (photoBtn) {
        handlePhotoAction(photoBtn.getAttribute('data-image-id'));
        return;
      }

      // 削除ボタン
      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        const rowId = deleteBtn.getAttribute('data-row');
        const imageId = deleteBtn.getAttribute('data-image-id') || '';
        await handleDeleteAction(rowId, imageId, deleteBtn);
        return;
      }

      // 完了ボタン
      const doneBtn = e.target.closest('.done-btn');
      if (doneBtn) {
        const rowId = doneBtn.getAttribute('data-row');
        const dateVal = doneBtn.getAttribute('data-date');
        const timeVal = doneBtn.getAttribute('data-time');
        const clientVal = doneBtn.getAttribute('data-client') || '';
        const contentVal = doneBtn.getAttribute('data-content') || '';
        await handleDoneAction(rowId, dateVal, timeVal, clientVal, contentVal, doneBtn);
        closeCardModal();
        return;
      }

      // 訂正ボタン
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const rowId = editBtn.getAttribute('data-row');
        const dateVal = editBtn.getAttribute('data-date');
        const timeVal = editBtn.getAttribute('data-time');
        const clientVal = editBtn.getAttribute('data-client');
        const contentVal = editBtn.getAttribute('data-content');
        const imageIdVal = editBtn.getAttribute('data-image-id') || '';
        handleEditAction(rowId, dateVal, timeVal, clientVal, contentVal, imageIdVal);
        closeCardModal();
        return;
      }

      // 閉じる×ボタン
      const closeBtn = e.target.closest('.expanded-close-btn');
      if (closeBtn) {
        closeCardModal();
      }
    });
  }

  // 編集開始用関数
  const startEditing = (rowId, dateVal, timeVal, clientVal, contentVal, imageId) => {
    // 画面の最上部（入力画面）までスムーズにスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 値のセット
    editRowInput.value = rowId;
    editActionInput.value = 'update';
    
    // 日付 (YYYY-MM-DDに直してセット)
    let ymd = dateVal || '';
    if(ymd.includes('/')) ymd = ymd.replace(/\//g, '-');
    dateInput.value = ymd;
    
    // 時刻
    timeInput.value = formatTimeString(timeVal);
    
    const clientInput = document.getElementById('client');
    clientInput.value = clientVal || '';

    // 写真のプレビュー復元 (v2.1 複数対応)
    clearPhotoSelection();
    if (imageId) {
      const ids = imageId.split(',').filter(id => id.trim() !== '');
      ids.forEach((id, index) => {
        selectedImages.push({
          id: id,
          name: `photo_${index + 1}.jpg`,
          isExisting: true
        });
      });
      renderPhotoPreviews();
      // 初期状態では画像変更なし (送信しないが、元データを維持するよう hasImageUpdate = false)
      hasImageUpdate = false;
    } else {
      hasImageUpdate = false;
    }
    
    // コンテンツとタグ・担当者の分離
    let rawContent = contentVal || '';
    let foundTag = false;
    const radiosStatus = document.querySelectorAll('input[name="status"]');
    
    // 改行などの余分な空白を削除してからタグ判定
    rawContent = rawContent.trim();
    
    if (rawContent.endsWith('[!]')) {
      radiosStatus.forEach(r => { if(r.value === '[!]') r.checked = true; });
      rawContent = rawContent.substring(0, rawContent.length - 3).trim();
      foundTag = true;
    } else if (rawContent.endsWith('[#]')) {
      radiosStatus.forEach(r => { if(r.value === '[#]') r.checked = true; });
      rawContent = rawContent.substring(0, rawContent.length - 3).trim();
      foundTag = true;
    } else if (rawContent.endsWith('[$]')) {
      radiosStatus.forEach(r => { if(r.value === '[$]') r.checked = true; });
      rawContent = rawContent.substring(0, rawContent.length - 3).trim();
      foundTag = true;
    }
    
    // 担当者の抜き出し
    const authors = ['社長', '伸明', '横澤'];
    let foundAuthor = false;
    let originalAuthor = '';
    if (foundTag) {
      for (const a of authors) {
        if (rawContent.endsWith(a)) {
          originalAuthor = a;
          rawContent = rawContent.substring(0, rawContent.length - a.length).trim();
          foundAuthor = true;
          break;
        }
      }
    }
    
    // 隠しフィールドに元の担当者を退避
    const editAuthorInput = document.getElementById('editAuthor');
    if (editAuthorInput) {
      editAuthorInput.value = originalAuthor;
    }
    
    // もしタグが見つからなかったら一度ラジオボタンのチェックを外す
    if(!foundTag) {
      radiosStatus.forEach(r => r.checked = false);
    }
    
    document.getElementById('content').value = rawContent;
    
    // ボタンの見た目を変える
    submitBtnText.textContent = '更新する';
    submitIcon.textContent = 'save';
    cancelEditBtn.classList.remove('hidden');
    
    // 少しハイライトアニメーション
    form.style.transform = 'scale(1.02)';
    setTimeout(()=> { form.style.transform = 'scale(1)'; }, 200);
  };

  // --- カレンダー機能ロジック (v1.9) ---

  // 日報がカレンダーの日付（登録日、または本文内の日付テキスト）と一致するか判定 (v2.1.3)
  function isNippouMatchingDate(nippou, year, month, day) {
    const regDate = formatDateString(nippou.date); // "YYYY/MM/DD"
    let regYear = year;
    let regMonth = month;
    let regDay = day;
    
    // 登録日の分解
    const dateMatch = regDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (dateMatch) {
      regYear = parseInt(dateMatch[1], 10);
      regMonth = parseInt(dateMatch[2], 10) - 1; // 0-11
      regDay = parseInt(dateMatch[3], 10);
    }

    // 登録日は常に一致と判定し、最優先で表示する (v2.1.3)
    if (regYear === year && regMonth === month && regDay === day) {
      return true;
    }

    const content = (nippou.content || '').trim();
    
    // 1. 本文からすべての西暦付き日付（YYYY/M/D または YYYY/MM/DD）を抽出する
    const ymdRegex = /(\d{4})\/(\d{1,2})\/(\d{1,2})/g;
    let ymdMatches = [];
    let matchArr;
    while ((matchArr = ymdRegex.exec(content)) !== null) {
      ymdMatches.push({
        y: parseInt(matchArr[1], 10),
        m: parseInt(matchArr[2], 10) - 1,
        d: parseInt(matchArr[3], 10)
      });
    }

    if (ymdMatches.length > 0) {
      // 本文に西暦付き日付が指定されている場合
      // A. 現在のセル (year, month, day) と一致する西暦日付が本文に書かれているか？
      const hasSpecificYmd = ymdMatches.some(item => item.y === year && item.m === month && item.d === day);
      if (hasSpecificYmd) {
        return true;
      }
      
      // B. 一致するものがなく、かつ本文に別の西暦日付が書かれている場合
      // 登録日の判定はすでに行っているため、ここでの処理は「登録日以外の日付」へのマッチのみを考慮する
    }

    // 2. 本文から月日のみ（M/D または MM/DD）のパターンをチェックする
    // ただし、表示しているカレンダーの年 (year) と日報の登録年 (regYear) が一致している場合のみ判定
    if (year === regYear) {
      const mLong = String(month + 1).padStart(2, '0');
      const mShort = String(month + 1);
      const dLong = String(day).padStart(2, '0');
      const dShort = String(day);

      // 前後に数字がない「M/D」または「MM/DD」をテスト。
      // 西暦付きの日付（例: 2026/6/19）に誤マッチしないよう、西暦付き日付を除外したテキストで判定する
      function testMonthDayPattern(text, m, d) {
        const textWithoutYmd = text.replace(/\d{4}\/\d{1,2}\/\d{1,2}/g, '');
        const cleanRegex = new RegExp(`(?:^|[^\\d])${m}\\/${d}(?:[^\\d]|$)`);
        return cleanRegex.test(textWithoutYmd);
      }

      if (testMonthDayPattern(content, mShort, dShort) || testMonthDayPattern(content, mLong, dLong)) {
        return true;
      }
    }

    return false;
  }

  // 全日報データを取得 (キャッシュ対応)
  async function loadAllNippouData(force = false) {
    if (allNippouData && !force) return allNippouData;
    
    showCalendarLoading(true);
    
    try {
      const response = await fetch(`${GAS_URL}?keyword=${encodeURIComponent('/')}`);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const data = await response.json();
      if (data.status === 'success') {
        allNippouData = data.results || [];
        return allNippouData;
      } else {
        throw new Error(data.message || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('Fetch all error:', error);
      showMessage('カレンダー用データの取得に失敗しました。', 'error');
      return [];
    } finally {
      showCalendarLoading(false);
    }
  }

  // ローディング表示
  function showCalendarLoading(show) {
    if (!calendarGrid) return;
    if (show) {
      calendarGrid.innerHTML = `
        <div style="grid-column: span 7; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; color: var(--text-muted); gap: 0.5rem; background: var(--input-bg);">
          <div class="spinner" style="width: 2rem; height: 2rem; color: var(--primary);"></div>
          <span style="font-size: 0.9rem; font-weight: 600;">日報データを読み込み中...</span>
        </div>
      `;
    }
  }

  // カレンダー描画
  function renderCalendar(year, month, nippouList) {
    if (!calendarGrid || !calendarMonthTitle) return;

    calendarGrid.innerHTML = '';
    calendarMonthTitle.textContent = `${year}年${month + 1}月`;

    // 最初の日の曜日 (0:日, 1:月, ... 6:土)
    const firstDay = new Date(year, month, 1);
    let startDayOfWeek = firstDay.getDay();
    // 月曜始まりのオフセット計算
    let offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    // 当月と前月の日数
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // 前月の日付埋め
    for (let i = offset - 1; i >= 0; i--) {
      const day = prevMonthTotalDays - i;
      const cell = createCalendarCell(year, month - 1, day, false, null);
      calendarGrid.appendChild(cell);
    }

    // 当月の日付
    for (let day = 1; day <= totalDays; day++) {
      const dayNippous = nippouList.filter(n => isNippouMatchingDate(n, year, month, day));

      const cell = createCalendarCell(year, month, day, true, dayNippous);
      calendarGrid.appendChild(cell);
    }

    // 翌月の日付埋め
    const currentTotalCells = offset + totalDays;
    const nextMonthCells = (7 - (currentTotalCells % 7)) % 7;
    for (let day = 1; day <= nextMonthCells; day++) {
      const cell = createCalendarCell(year, month + 1, day, false, null);
      calendarGrid.appendChild(cell);
    }
  }

  // カレンダーセル作成
  function createCalendarCell(year, month, day, isCurrentMonth, dayNippous) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    
    // 日曜日の場合は背景色やテキスト色で分かりやすく
    const cellDate = new Date(year, month, day);
    const dow = cellDate.getDay(); // 0:日, 6:土

    if (!isCurrentMonth) {
      cell.style.opacity = '0.3';
      cell.style.cursor = 'default';
    } else {
      cell.addEventListener('click', () => {
        showDayNippouList(year, month, day, dayNippous);
      });
    }

    // 日付テキスト
    const dayNum = document.createElement('span');
    dayNum.textContent = day;
    dayNum.style.fontSize = '0.75rem';
    dayNum.style.fontWeight = '700';
    dayNum.style.color = 'var(--text-main)';
    dayNum.style.marginBottom = '4px';

    if (isCurrentMonth) {
      if (dow === 0) dayNum.style.color = '#ef4444'; // 日曜
      else if (dow === 6) dayNum.style.color = '#3b82f6'; // 土曜
      
      // 今日の日付をハイライト
      const today = new Date();
      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
        dayNum.style.background = 'var(--primary)';
        dayNum.style.color = 'white';
        dayNum.style.borderRadius = '50%';
        dayNum.style.width = '1.2rem';
        dayNum.style.height = '1.2rem';
        dayNum.style.display = 'flex';
        dayNum.style.alignItems = 'center';
        dayNum.style.justifyContent = 'center';
      }
    }
    
    cell.appendChild(dayNum);

    // 日報データの件数バー表示
    if (isCurrentMonth && dayNippous && dayNippous.length > 0) {
      let progressCount = 0; // [#] 継続中
      let memoCount = 0;     // [$] メモ
      let doneCount = 0;     // [!] 完了

      dayNippous.forEach(n => {
        const content = n.content || '';
        if (content.includes('[#]')) progressCount++;
        else if (content.includes('[$]')) memoCount++;
        else if (content.includes('[!]')) doneCount++;
      });

      const barContainer = document.createElement('div');
      barContainer.style.display = 'flex';
      barContainer.style.flexDirection = 'column';
      barContainer.style.gap = '2px';
      barContainer.style.width = '100%';
      barContainer.style.marginTop = 'auto'; // 下部に配置

      // 継続中 (赤)
      if (progressCount > 0) {
        const bar = document.createElement('div');
        bar.className = 'calendar-bar-red';
        bar.textContent = `継続中 ${progressCount}`;
        barContainer.appendChild(bar);
      }
      // メモ (黄)
      if (memoCount > 0) {
        const bar = document.createElement('div');
        bar.className = 'calendar-bar-yellow';
        bar.textContent = `メモ ${memoCount}`;
        barContainer.appendChild(bar);
      }
      // 完了 (緑)
      if (doneCount > 0) {
        const bar = document.createElement('div');
        bar.className = 'calendar-bar-green';
        bar.textContent = `完了 ${doneCount}`;
        barContainer.appendChild(bar);
      }

      cell.appendChild(barContainer);
    }

    return cell;
  }

  // 日報セルタップ時の日別一覧への遷移
  function showDayNippouList(year, month, day, dayNippous) {
    if (!searchResultsEl || !calendarContainer || !backToCalendarBtn || !searchSection) return;

    calendarContainer.classList.add('hidden');
    searchSection.classList.remove('hidden'); // 検索セクションを表示する
    backToCalendarBtn.classList.remove('hidden');

    // 検索入力にその日付をセット（検索動作と整合させる）
    const dateStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    if (searchInput) {
      searchInput.value = dateStr;
    }

    // 検索フォーム等は非表示にする
    if (searchForm) searchForm.classList.add('hidden');
    if (searchHelpers) searchHelpers.style.display = 'none';

    // 一覧を描画
    renderSearchResults(dayNippous);
    
    // スムーズスクロール
    searchResultsEl.scrollIntoView({ behavior: 'smooth' });
  }

  // カレンダー画面に戻る
  function backToCalendar() {
    if (calendarContainer) calendarContainer.classList.remove('hidden');
    if (backToCalendarBtn) backToCalendarBtn.classList.add('hidden');
    if (searchSection) searchSection.classList.add('hidden'); // 検索セクション全体を隠す
    if (searchForm) searchForm.classList.remove('hidden');
    if (searchHelpers) searchHelpers.style.display = 'flex';
    if (searchResultsEl) searchResultsEl.innerHTML = '';

    // キャッシュがクリアされている（データが更新された）場合のみ再読み込み＆再描画 (v1.9.6)
    if (allNippouData === null) {
      if (GAS_URL) {
        loadAllNippouData().then(nippous => {
          renderCalendar(calendarCurrentYear, calendarCurrentMonth, nippous);
        });
      }
    }
  }

  // カレンダーモードのトグル
  function toggleCalendarMode(forceState) {
    if (typeof forceState === 'boolean') {
      isCalendarMode = forceState;
    } else {
      isCalendarMode = !isCalendarMode;
    }

    if (!calendarViewBtn) return;

    if (isCalendarMode) {
      calendarViewBtnText.textContent = '検索表示';
      if (calendarViewBtnIcon) calendarViewBtnIcon.textContent = 'search';

      if (searchSection) searchSection.classList.add('hidden'); // 検索セクション全体を隠す
      if (searchForm) searchForm.classList.add('hidden');
      if (searchHelpers) searchHelpers.style.display = 'none';
      if (searchResultsEl) searchResultsEl.innerHTML = '';
      if (backToCalendarBtn) backToCalendarBtn.classList.add('hidden');
      if (calendarContainer) calendarContainer.classList.remove('hidden');

      if (GAS_URL) {
        loadAllNippouData().then(nippous => {
          renderCalendar(calendarCurrentYear, calendarCurrentMonth, nippous);
        });
      } else {
        showMessage('先に右上の設定（歯車）ボタンから、GASのURLを設定してください。', 'error');
        isCalendarMode = false;
        toggleCalendarMode(false);
      }
    } else {
      calendarViewBtnText.textContent = 'カレンダー表示';
      if (calendarViewBtnIcon) calendarViewBtnIcon.textContent = 'calendar_month';

      if (searchSection) searchSection.classList.remove('hidden'); // 検索セクション全体を表示する
      if (searchForm) searchForm.classList.remove('hidden');
      if (searchHelpers) searchHelpers.style.display = 'flex';
      if (searchResultsEl) searchResultsEl.innerHTML = '';
      if (backToCalendarBtn) backToCalendarBtn.classList.add('hidden');
      if (calendarContainer) calendarContainer.classList.add('hidden');
    }
  }

  // イベントリスナーの登録
  if (calendarViewBtn) {
    calendarViewBtn.addEventListener('click', () => toggleCalendarMode());
  }

  if (backToCalendarBtn) {
    backToCalendarBtn.addEventListener('click', backToCalendar);
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      calendarCurrentMonth--;
      if (calendarCurrentMonth < 0) {
        calendarCurrentMonth = 11;
        calendarCurrentYear--;
      }
      loadAllNippouData().then(nippous => {
        renderCalendar(calendarCurrentYear, calendarCurrentMonth, nippous);
      });
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      calendarCurrentMonth++;
      if (calendarCurrentMonth > 11) {
        calendarCurrentMonth = 0;
        calendarCurrentYear++;
      }
      loadAllNippouData().then(nippous => {
        renderCalendar(calendarCurrentYear, calendarCurrentMonth, nippous);
      });
    });
  }

  // --- 写真関連ロジック (v2.0.1) ---

  // 画像ファイルをリサイズ・圧縮してBase64で取得する関数 (v2.0.1)
  function resizeAndCompressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // アスペクト比を維持しながらリサイズ
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // jpeg形式に圧縮してBase64データを取得
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // 写真プレビューとデータ状態をクリアする (v2.1.1 複数対応)
  function clearPhotoSelection() {
    selectedImages = [];
    hasImageUpdate = true; // クリアされた（削除された）場合も更新扱いにする
    if (photoPreviewContainer) {
      photoPreviewContainer.innerHTML = '';
      photoPreviewContainer.classList.add('hidden');
    }
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
  }

  // 特定の写真のプレビューと管理用配列からの削除 (v2.1 複数対応)
  function removePhoto(index) {
    selectedImages.splice(index, 1);
    hasImageUpdate = true;
    renderPhotoPreviews();
  }

  // 選択・追加された写真のプレビュー表示を描画する (v2.1 複数対応)
  function renderPhotoPreviews() {
    if (!photoPreviewContainer) return;
    
    photoPreviewContainer.innerHTML = '';
    
    if (selectedImages.length === 0) {
      photoPreviewContainer.classList.add('hidden');
      return;
    }
    
    selectedImages.forEach((img, index) => {
      const item = document.createElement('div');
      item.className = 'photo-preview-item';
      
      const imgSrc = img.isExisting 
        ? `https://drive.google.com/thumbnail?id=${img.id}&sz=w100` 
        : img.data;
        
      const imageEl = document.createElement('img');
      imageEl.src = imgSrc;
      imageEl.alt = img.name;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'photo-preview-delete-btn';
      deleteBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
      
      // 個別削除
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePhoto(index);
      });
      
      item.appendChild(imageEl);
      item.appendChild(deleteBtn);
      photoPreviewContainer.appendChild(item);
    });
    
    photoPreviewContainer.classList.remove('hidden');
  }

  // 選択された画像ファイル群を処理して selectedImages に追加する共通関数 (v2.1.1)
  async function addSelectedFiles(files, inputEl) {
    if (!files || files.length === 0) return;

    // 枚数制限チェック (既存画像と合わせて最大5枚まで)
    if (selectedImages.length + files.length > 5) {
      alert('写真の添付は1つの日報に対して最大5枚までです。');
      if (inputEl) inputEl.value = '';
      return;
    }

    // 順次画像を圧縮して管理配列へ追加
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let name = file.name || `photo_${Date.now()}_${i}.jpg`;
      
      // 圧縮してjpegにするため、拡張子を.jpgにする
      if (!name.toLowerCase().endsWith('.jpg') && !name.toLowerCase().endsWith('.jpeg')) {
        const lastDot = name.lastIndexOf('.');
        if (lastDot !== -1) {
          name = name.substring(0, lastDot) + '.jpg';
        } else {
          name += '.jpg';
        }
      }

      try {
        // 画像を最大1024pxサイズ、品質70%に自動リサイズ・圧縮
        const compressedBase64 = await resizeAndCompressImage(file, 1024, 1024, 0.7);
        selectedImages.push({
          data: compressedBase64,
          name: name,
          isNew: true
        });
      } catch (err) {
        console.error('Image compression error:', err);
        alert(`${file.name || '画像'} の処理に失敗しました。`);
      }
    }

    hasImageUpdate = true;
    renderPhotoPreviews();
    if (inputEl) inputEl.value = ''; // 再選択可能にするためクリア
  }

  // --- 写真追加ソース選択モーダルの制御 (v2.1.2) ---
  if (photoAddBtn && photoSourceModal) {
    photoAddBtn.addEventListener('click', () => {
      // 既存画像と合わせて最大5枚制限チェック
      if (selectedImages.length >= 5) {
        alert('写真の添付は1つの日報に対して最大5枚までです。');
        return;
      }
      photoSourceModal.style.display = 'flex';
    });
  }

  // モーダル内の「写真を撮影する」ボタン
  if (modalCameraBtn && cameraInput && photoSourceModal) {
    modalCameraBtn.addEventListener('click', () => {
      photoSourceModal.style.display = 'none';
      cameraInput.click();
    });
  }

  // モーダル内の「アルバムから選択する」ボタン
  if (modalGalleryBtn && galleryInput && photoSourceModal) {
    modalGalleryBtn.addEventListener('click', () => {
      photoSourceModal.style.display = 'none';
      galleryInput.click();
    });
  }

  // モーダルを閉じる×ボタン
  if (closePhotoSourceModalBtn && photoSourceModal) {
    closePhotoSourceModalBtn.addEventListener('click', () => {
      photoSourceModal.style.display = 'none';
    });
  }

  // モーダルの背景クリックで閉じる
  if (photoSourceModal) {
    photoSourceModal.addEventListener('click', (e) => {
      if (e.target === photoSourceModal) {
        photoSourceModal.style.display = 'none';
      }
    });
  }

  // カメラ撮影完了イベント (1枚)
  if (cameraInput) {
    cameraInput.addEventListener('change', async (e) => {
      await addSelectedFiles(e.target.files, cameraInput);
    });
  }

  // アルバム選択完了イベント (複数可)
  if (galleryInput) {
    galleryInput.addEventListener('change', async (e) => {
      await addSelectedFiles(e.target.files, galleryInput);
    });
  }

  // 写真表示ポップアップ（スライドショー）の読み込みヘルパー
  function loadActiveModalImage() {
    if (activeModalImages.length === 0 || !photoModalImage || !photoModalSpinner || !photoModalDriveLink) return;
    
    const currentId = activeModalImages[activeModalIndex];
    
    photoModalSpinner.style.display = 'block';
    photoModalImage.style.display = 'none';
    
    photoModalImage.onload = () => {
      photoModalSpinner.style.display = 'none';
      photoModalImage.style.display = 'block';
    };
    
    photoModalImage.onerror = () => {
      photoModalSpinner.style.display = 'none';
      if (photoModalImage.src !== '') {
        alert('写真の読み込みに失敗しました。アクセス権限やIDをご確認ください。');
      }
    };
    
    photoModalImage.src = `https://drive.google.com/thumbnail?id=${currentId}&sz=w800`;
    photoModalDriveLink.href = `https://drive.google.com/open?id=${currentId}`;
    
    if (photoModalBadge) {
      photoModalBadge.textContent = `${activeModalIndex + 1} / ${activeModalImages.length}`;
    }
  }

  // 写真プレビューモーダルを開く (v2.1 複数写真スライドショー対応)
  function openPhotoModal(imageId) {
    if (!photoModal || !photoModalImage || !photoModalSpinner || !photoModalDriveLink) return;

    // カンマ区切りの写真IDを配列に変換
    activeModalImages = imageId.split(',').filter(id => id.trim() !== '');
    if (activeModalImages.length === 0) return;
    
    activeModalIndex = 0;
    photoModal.style.display = 'flex';
    
    // 複数ある場合のみ切り替えボタンとバッジを表示
    const showControls = activeModalImages.length > 1;
    if (prevPhotoBtn) prevPhotoBtn.style.display = showControls ? 'flex' : 'none';
    if (nextPhotoBtn) nextPhotoBtn.style.display = showControls ? 'flex' : 'none';
    if (photoModalBadge) photoModalBadge.style.display = showControls ? 'block' : 'none';

    loadActiveModalImage();
  }

  // 写真プレビューモーダルを閉じる (v2.1 複数対応)
  function closePhotoModal() {
    if (photoModal) {
      photoModal.style.display = 'none';
    }
    if (photoModalImage) {
      photoModalImage.onload = null;
      photoModalImage.onerror = null;
      photoModalImage.src = '';
      photoModalImage.style.display = 'none';
    }
    activeModalImages = [];
    activeModalIndex = 0;
  }

  // 切り替えボタンイベントのバインド (v2.1)
  if (prevPhotoBtn) {
    prevPhotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeModalImages.length <= 1) return;
      activeModalIndex = (activeModalIndex - 1 + activeModalImages.length) % activeModalImages.length;
      loadActiveModalImage();
    });
  }

  if (nextPhotoBtn) {
    nextPhotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeModalImages.length <= 1) return;
      activeModalIndex = (activeModalIndex + 1) % activeModalImages.length;
      loadActiveModalImage();
    });
  }

  if (closePhotoModalBtn) {
    closePhotoModalBtn.addEventListener('click', closePhotoModal);
  }

  if (photoModal) {
    // モーダル背景クリックで閉じる
    photoModal.addEventListener('click', (e) => {
      if (e.target === photoModal) {
        closePhotoModal();
      }
    });
  }
});
