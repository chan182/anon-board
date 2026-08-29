const CATEGORY_LABEL = {
  boss: "직장 상사",
  relationship: "인간관계",
  friend: "학교·친구",
  etc: "기타",
};

const tabs = document.querySelectorAll(".tab");
const postList = document.getElementById("post-list");
const emptyState = document.getElementById("empty-state");
const contentInput = document.getElementById("post-content");
const categorySelect = document.getElementById("post-category");
const charCount = document.getElementById("char-count");
const submitBtn = document.getElementById("submit-btn");

let activeCategory = "all";
let unsubscribe = null;
const expandedPosts = new Set();
const commentUnsubs = new Map();

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
    await db.collection("posts").add({
      category: categorySelect.value,
      content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
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

    const body = document.createElement("p");
    body.className = "post-content";
    body.textContent = data.content;

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
    (snapshot) => renderPosts(snapshot.docs),
    (err) => console.error(err)
  );
}

subscribeToPosts();
