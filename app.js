const CATEGORY_LABEL = {
  boss: "직장 상사",
  relationship: "인간관계",
  friend: "학교·친구",
  etc: "기타",
};
const PREVIEW_LENGTH = 10;

const tabs = document.querySelectorAll(".tab");
const postList = document.getElementById("post-list");
const emptyState = document.getElementById("empty-state");
const contentInput = document.getElementById("post-content");
const categorySelect = document.getElementById("post-category");
const charCount = document.getElementById("char-count");
const submitBtn = document.getElementById("submit-btn");
const authArea = document.getElementById("auth-area");
const authModal = document.getElementById("auth-modal");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const modalSwitchLink = document.getElementById("modal-switch-link");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");
const authSubmit = document.getElementById("auth-submit");

let activeCategory = "all";
let unsubscribe = null;
let currentUser = null;
let lastDocs = [];
let authMode = "signup";
const expandedPosts = new Set();
const commentUnsubs = new Map();

function authErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "이미 가입된 이메일이에요.";
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않아요.";
    case "auth/weak-password":
      return "비밀번호는 6자 이상이어야 해요.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "이메일 또는 비밀번호가 올바르지 않아요.";
    default:
      return "문제가 발생했어요. 잠시 후 다시 시도해주세요.";
  }
}

function updateModalMode() {
  if (authMode === "signup") {
    modalTitle.textContent = "회원가입";
    authSubmit.textContent = "가입하기";
    modalSwitchLink.textContent = "로그인";
  } else {
    modalTitle.textContent = "로그인";
    authSubmit.textContent = "로그인";
    modalSwitchLink.textContent = "회원가입";
  }
}

function openAuthModal(mode) {
  authMode = mode;
  authError.hidden = true;
  authEmail.value = "";
  authPassword.value = "";
  updateModalMode();
  authModal.hidden = false;
}

function closeAuthModal() {
  authModal.hidden = true;
}

modalClose.addEventListener("click", closeAuthModal);
modalSwitchLink.addEventListener("click", (e) => {
  e.preventDefault();
  authMode = authMode === "signup" ? "login" : "signup";
  updateModalMode();
});

authSubmit.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;
  authSubmit.disabled = true;
  authError.hidden = true;
  try {
    if (authMode === "signup") {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    closeAuthModal();
  } catch (err) {
    authError.textContent = authErrorMessage(err.code);
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

function renderAuthArea() {
  authArea.innerHTML = "";
  if (currentUser) {
    const emailSpan = document.createElement("span");
    emailSpan.className = "auth-email";
    emailSpan.textContent = currentUser.email;

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "auth-btn";
    logoutBtn.textContent = "로그아웃";
    logoutBtn.addEventListener("click", () => auth.signOut());

    authArea.appendChild(emailSpan);
    authArea.appendChild(logoutBtn);
  } else {
    const loginBtn = document.createElement("button");
    loginBtn.className = "auth-btn";
    loginBtn.textContent = "로그인";
    loginBtn.addEventListener("click", () => openAuthModal("login"));

    const signupBtn = document.createElement("button");
    signupBtn.className = "auth-btn primary";
    signupBtn.textContent = "회원가입";
    signupBtn.addEventListener("click", () => openAuthModal("signup"));

    authArea.appendChild(loginBtn);
    authArea.appendChild(signupBtn);
  }
}

auth.onAuthStateChanged((user) => {
  currentUser = user;
  renderAuthArea();
  renderPosts(lastDocs);
});

contentInput.addEventListener("input", () => {
  charCount.textContent = `${contentInput.value.length} / 1000`;
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.category;
    subscribeToPosts();
  });
});

submitBtn.addEventListener("click", async () => {
  const content = contentInput.value.trim();
  if (!content) return;

  submitBtn.disabled = true;
  try {
    const postRef = db.collection("posts").doc();
    const batch = db.batch();
    batch.set(postRef, {
      category: categorySelect.value,
      preview: content.slice(0, PREVIEW_LENGTH),
      truncated: content.length > PREVIEW_LENGTH,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection("post_full").doc(postRef.id), {
      content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    contentInput.value = "";
    charCount.textContent = "0 / 1000";
  } catch (err) {
    alert("글을 올리는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
});

function timeAgo(date) {
  if (!date) return "방금 전";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

// Content gating (sign-up wall) is temporarily disabled while the site is
// under AdSense review — full content is fetched for everyone regardless of
// login state. See firestore.rules for the matching post_full read rule.
function renderPostBody(data, postId) {
  if (!data.truncated) {
    const body = document.createElement("p");
    body.className = "post-content";
    body.textContent = data.preview;
    return body;
  }

  const body = document.createElement("p");
  body.className = "post-content";
  body.textContent = data.preview + "...";
  db.collection("post_full")
    .doc(postId)
    .get()
    .then((snap) => {
      if (snap.exists) body.textContent = snap.data().content;
    })
    .catch((err) => console.error(err));
  return body;
}

function renderPosts(docs) {
  commentUnsubs.forEach((unsub) => unsub());
  commentUnsubs.clear();

  postList.innerHTML = "";

  if (docs.length === 0) {
    postList.appendChild(emptyState);
    return;
  }

  docs.forEach((doc) => {
    const data = doc.data();
    const postId = doc.id;
    const card = document.createElement("article");
    card.className = "post-card";

    const meta = document.createElement("div");
    meta.className = "post-meta";
    meta.innerHTML = `<span class="post-category">${CATEGORY_LABEL[data.category] || "기타"}</span><span class="post-time">${timeAgo(data.createdAt ? data.createdAt.toDate() : null)}</span>`;

    const body = renderPostBody(data, postId);

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const commentToggle = document.createElement("button");
    commentToggle.className = "comment-toggle";
    commentToggle.textContent = "댓글";

    const reportBtn = document.createElement("button");
    reportBtn.className = "report-btn";
    reportBtn.textContent = "신고";
    reportBtn.addEventListener("click", () => reportPost(postId, reportBtn));

    actions.appendChild(commentToggle);
    actions.appendChild(reportBtn);

    const commentSection = document.createElement("div");
    commentSection.className = "comment-section";
    commentSection.hidden = true;

    const commentListEl = document.createElement("div");
    commentListEl.className = "comment-list";

    const commentForm = document.createElement("div");
    commentForm.className = "comment-form";

    const commentInput = document.createElement("input");
    commentInput.type = "text";
    commentInput.maxLength = 300;
    commentInput.placeholder = "익명으로 댓글 남기기";

    const commentSubmit = document.createElement("button");
    commentSubmit.textContent = "등록";

    const submitComment = async () => {
      const content = commentInput.value.trim();
      if (!content) return;
      commentSubmit.disabled = true;
      try {
        await db.collection("posts").doc(postId).collection("comments").add({
          content,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        commentInput.value = "";
      } catch (err) {
        console.error(err);
      } finally {
        commentSubmit.disabled = false;
      }
    };
    commentSubmit.addEventListener("click", submitComment);
    commentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitComment();
    });

    commentForm.appendChild(commentInput);
    commentForm.appendChild(commentSubmit);
    commentSection.appendChild(commentListEl);
    commentSection.appendChild(commentForm);

    commentToggle.addEventListener("click", () => {
      const isHidden = commentSection.hidden;
      commentSection.hidden = !isHidden;
      if (isHidden) {
        expandedPosts.add(postId);
        subscribeToComments(postId, commentListEl);
      } else {
        expandedPosts.delete(postId);
        const unsub = commentUnsubs.get(postId);
        if (unsub) {
          unsub();
          commentUnsubs.delete(postId);
        }
      }
    });

    card.appendChild(meta);
    card.appendChild(body);
    card.appendChild(actions);
    card.appendChild(commentSection);
    postList.appendChild(card);

    if (expandedPosts.has(postId)) {
      commentSection.hidden = false;
      subscribeToComments(postId, commentListEl);
    }
  });
}

function subscribeToComments(postId, listEl) {
  const unsub = db
    .collection("posts")
    .doc(postId)
    .collection("comments")
    .orderBy("createdAt", "asc")
    .onSnapshot(
      (snapshot) => {
        listEl.innerHTML = "";
        if (snapshot.empty) {
          const empty = document.createElement("p");
          empty.className = "comment-empty";
          empty.textContent = "아직 댓글이 없어요.";
          listEl.appendChild(empty);
          return;
        }
        snapshot.docs.forEach((cdoc) => {
          const cdata = cdoc.data();
          const item = document.createElement("div");
          item.className = "comment-item";

          const contentSpan = document.createElement("span");
          contentSpan.className = "comment-content";
          contentSpan.textContent = cdata.content;

          const timeSpan = document.createElement("span");
          timeSpan.className = "comment-time";
          timeSpan.textContent = timeAgo(cdata.createdAt ? cdata.createdAt.toDate() : null);

          item.appendChild(contentSpan);
          item.appendChild(timeSpan);
          listEl.appendChild(item);
        });
      },
      (err) => console.error(err)
    );
  commentUnsubs.set(postId, unsub);
}

async function reportPost(postId, btn) {
  if (!confirm("이 글을 신고하시겠어요?")) return;
  btn.disabled = true;
  btn.textContent = "신고됨";
  try {
    await db.collection("reports").add({
      postId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
  }
}

function subscribeToPosts() {
  if (unsubscribe) unsubscribe();

  let query = db.collection("posts").orderBy("createdAt", "desc").limit(100);
  if (activeCategory !== "all") {
    query = db
      .collection("posts")
      .where("category", "==", activeCategory)
      .orderBy("createdAt", "desc")
      .limit(100);
  }

  unsubscribe = query.onSnapshot(
    (snapshot) => {
      lastDocs = snapshot.docs;
      renderPosts(lastDocs);
    },
    (err) => console.error(err)
  );
}

subscribeToPosts();
