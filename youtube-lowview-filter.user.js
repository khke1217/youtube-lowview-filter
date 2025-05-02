// ==UserScript==
// @name         YouTube 조회수 기반 필터링
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  YouTube의 추천 영상 중 구독하지 않은 채널의 일정 조회수 미만의 영상을 제거합니다.
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(async function () {
    'use strict';

    const SUBS_KEY = "subs";
    const THRESHOLD_KEY = "view_threshold";

    let subscribed = new Set(JSON.parse(await GM_getValue(SUBS_KEY, "[]")));
    let viewThreshold = parseInt(await GM_getValue(THRESHOLD_KEY, "1000"));

    // 메뉴: 구독 목록 초기화
    GM_registerMenuCommand("🧨 구독 목록 초기화", async () => {
        if (confirm("정말 초기화할까요?")) {
            subscribed.clear();
            await GM_setValue(SUBS_KEY, JSON.stringify([]));
            alert("구독 목록이 초기화되었습니다.");
        }
    });

    // 메뉴: 조회수 기준 설정
    GM_registerMenuCommand("📊 조회수 기준 설정 (현재: " + viewThreshold + ")", async () => {
        const input = prompt("영상 필터링에 사용할 최소 조회수는?", viewThreshold);
        const parsed = parseInt(input);
        if (!isNaN(parsed)) {
            viewThreshold = parsed;
            await GM_setValue(THRESHOLD_KEY, parsed.toString());
            alert("새 기준이 저장되었습니다: " + parsed);
        }
    });

    // 구독 목록 추출/이동 버튼
    if (location.pathname === "/feed/channels") {
        GM_registerMenuCommand("📥 현재 페이지에서 구독 목록 추출", async () => {
            const elems = document.querySelectorAll('ytd-channel-renderer #main-link yt-formatted-string');
            const names = [...new Set(Array.from(elems).map(e => e.textContent.trim()).filter(Boolean))];
            if (names.length) {
                subscribed = new Set(names);
                await GM_setValue(SUBS_KEY, JSON.stringify([...subscribed]));
                alert(`총 ${names.length}개의 채널명을 저장했습니다.`);
            } else {
                alert("채널명을 찾지 못했습니다. 스크롤을 충분히 내려보세요.");
            }
        });
    } else {
        GM_registerMenuCommand("📤 구독 목록 추출하러 이동", () => {
            location.href = "https://www.youtube.com/feed/channels";
        });
    }

    // 구독 여부 판별
    function isChannelSubscribed() {
        const btn = document.querySelector('ytd-subscribe-button-renderer tp-yt-paper-button');
        if (!btn) return null;
        return btn.classList.contains("subscribed") || btn.innerText.includes("구독중") || btn.innerText.includes("Subscribed");
    }

    // 버튼 클릭 이벤트 등록
    function monitorSubscribeButton() {
        const btn = document.querySelector('ytd-subscribe-button-renderer tp-yt-paper-button');
        const channelEl = document.querySelector('ytd-channel-name');
        if (!btn || !channelEl) return;

        const channelName = channelEl.innerText.trim();

        btn.addEventListener('click', () => {
            setTimeout(async () => {
                const subscribedNow = isChannelSubscribed();
                if (subscribedNow === true && !subscribed.has(channelName)) {
                    subscribed.add(channelName);
                    await GM_setValue(SUBS_KEY, JSON.stringify([...subscribed]));
                    console.log(`✅ [버튼 클릭] ${channelName} 추가됨`);
                } else if (subscribedNow === false && subscribed.has(channelName)) {
                    subscribed.delete(channelName);
                    await GM_setValue(SUBS_KEY, JSON.stringify([...subscribed]));
                    console.log(`❌ [버튼 클릭] ${channelName} 제거됨`);
                }
            }, 1000);
        });
    }

    if (location.pathname.startsWith("/watch")) {
        monitorSubscribeButton();
    }

    // 조회수 문자열 파싱 (생방송 대응 포함)
    function parseViews(text) {
        const match = text.match(/([\d.,]+)([천만억]?)(?=\s*회|명\s*시청 중)/);
        if (!match) return null;
        let num = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2];
        if (unit === '천') num *= 1_000;
        else if (unit === '만') num *= 10_000;
        else if (unit === '억') num *= 100_000_000;
        return Math.floor(num);
    }

    // 영상 카드 필터링
    function processVideo(el) {
        if (el.dataset.filtered) return;
        el.dataset.filtered = "true";

        const viewText = el.innerText;
        const views = parseViews(viewText);
        if (!views || views >= viewThreshold) return;

        const nameEl = el.querySelector('ytd-channel-name, #channel-name');
        const name = nameEl?.innerText?.trim();
        if (!name || subscribed.has(name)) return;

        el.remove();
    }

    const observer = new MutationObserver(() => {
        document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer').forEach(processVideo);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 초기 실행
    document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer').forEach(processVideo);
})();
