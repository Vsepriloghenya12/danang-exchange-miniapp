import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function IconChevron({ className = "" }) {
    return (_jsx("svg", { viewBox: "0 0 24 24", className: className, fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M9 18l6-6-6-6" }) }));
}
function RowBtn({ title, subtitle, onClick }) {
    return (_jsxs("button", { type: "button", className: "mx-navCard", onClick: onClick, children: [_jsxs("div", { className: "mx-navText", style: { paddingLeft: 2 }, children: [_jsx("div", { className: "mx-navTitle", children: title }), subtitle ? _jsx("div", { className: "mx-navSub", children: subtitle }) : null] }), _jsx(IconChevron, { className: "mx-i mx-chev" })] }));
}
export default function OtherTab({ onFaq, onAbout, onContacts, onOrderApp, }) {
    return (_jsxs("div", { children: [_jsx(RowBtn, { title: "FAQ", subtitle: "\u0427\u0430\u0441\u0442\u043E \u0437\u0430\u0434\u0430\u0432\u0430\u0435\u043C\u044B\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u044B", onClick: onFaq }), _jsx("div", { className: "mx-sp10" }), _jsx(RowBtn, { title: "\u041E \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438", onClick: onAbout }), _jsx("div", { className: "mx-sp10" }), _jsx(RowBtn, { title: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u044B", onClick: onContacts }), _jsx("div", { className: "mx-sp10" }), _jsx(RowBtn, { title: "\u0417\u0430\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435", subtitle: "\u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0441 \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0447\u0438\u043A\u043E\u043C", onClick: onOrderApp })] }));
}
