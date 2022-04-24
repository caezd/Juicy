import doT from './doT.js';
import Fetcher from "../../Helpers/Fetcher.js";

var Component = function (elem, options) {

    // Check browser support
    if (!('DOMParser' in window)) throw 'Juicy.js is not supported by this browser.';

    // Make sure an element is provided
    if (!elem) throw 'Juicy.js: You did not provide an element to make into a component.';

    // Make sure a template is provided
    if (!options || !options.template) throw 'Juicy.js: You did not provide a template for this component.';

    // Set the component properties
    this.elem = typeof elem === 'string' ? document.querySelector(elem) : elem;
    this.template = options.template;

    // Set data
    let data = options.data || {};
    this.data = { ...data, ...this.buildData() };

    // Set callback to execute;
    this.callback = options.callback || function () { };

};

Component.prototype.buildData = function () {
    let vars = this.elem.querySelectorAll('var');
    let obj = {
        fields: {},
        contacts: {},
        awards: {},
        rpgs: {}
    };

    vars.forEach(v => {
        obj = Object.assign(obj, ((it) => {
            let result = this.parseVariables(it);
            // fields
            if (result.field) {
                obj.fields[slugify(result.field.label)] = result.field;
                return;
            }
            if (result.contact) {
                obj.contacts[slugify(result.contact.label)] = result.contact;
                return;
            }
            if (result.award) {
                obj.awards = { ...result.award };
                return;
            }
            if (result.rpg) {
                obj.rpgs[slugify(result.rpg.label)] = result.rpg;
                return;
            }
            return { ...result };

        })(v));
    });

    /*
    this.parseVars()
    */

    console.log(obj);
    return obj;
}


Component.prototype.parseVariables = function (v) {
    let children = v.children;
    let img;
    switch (v.title) {
        case 'avatar':
            img = v.querySelector('img');
            return {
                avatar_img: img?.outerHTML || '',
                avatar_src: img?.src || ''
            };
        case 'rpg_image':
            img = v.querySelector('img');
            return {
                cover_img: img?.outerHTML || '',
                cover_src: img?.src || ''
            };
        case 'username':
            return {
                username: v.innerHTML || '',
                username_text: v.innerText || ''
            };
        case 'rank':
        case 'online':
        case 'last_visit':
        case 'privmsg_count':
        case 'total_percent_msg':
        case 'total_daily_msg':
        case 'all_topics_opened':
        case 'all_by_topics':
        case 'all_by_messages':
        case 'admin':
        case 'ban':
            return {
                [v.title]: v.innerHTML || ''
            };
        case 'field':
            return {
                field: {
                    label: children[0].innerText.replace(/:/, '').trim(),
                    value: children[1].firstChild.innerHTML
                }
            };
        case 'contact':
            return {
                contact: {
                    label: children[0].innerText.replace(/:/, '').trim(),
                    value: children[1].firstChild.innerHTML
                }
            };
        case 'award':
            let awards = [];
            let html = v.innerHTML;
            let fragment = createDocumentFragment(html);
            let each = fragment.querySelectorAll('.award');
            each.forEach(el => {
                let imageValue = el.style.getPropertyValue('--award-image');

                awards.push({
                    class: el.classList[1],
                    image: imageValue,
                    image_url: imageValue.replace(/.+'(.+)'.+/g, '$1'),
                    title: el.querySelector('.award_tooltiptext_title').innerText,
                    description: Array.prototype.filter
                        .call(el.querySelector('.award_tooltiptext').childNodes, (child) => child.nodeType === Node.TEXT_NODE)
                        .map((child) => child.textContent)
                        .join('').trim()
                })
            });
            return {
                award: {
                    full_html: html || '',
                    list: awards
                }
            };
        case 'rpg':
            return {
                rpg: {
                    label: children[0].innerText.trim(),
                    value: children[1].firstChild.innerHTML
                }
            };
        default:

            break;
    };

    return {};
};

Component.prototype.render = function () {

    this.templateContainer = typeof this.template === 'string' ? document.querySelector(this.template) : this.template;

    /* REWORK */
    this.applyTemplate(this.templateContainer);
};

Component.prototype.applyTemplate = function (template) {
    let data = this.data;
    let keyRegex = /\[\:\s?([\w.]+)\s?\]/g;

    /*this.elem.innerHTML = template;*/
    var pagefn = doT.template(template.textContent, {
        argName: [...Object.keys(data)]
    });

    new Promise((resolve, reject) => {
        let fragment = new DocumentFragment();
        let container = document.createElement('div');
        container.classList.add('juicy-container', 'juicy-rendered')
        container.innerHTML = pagefn(data).replace(keyRegex, (match, key) => {
            return parseFunction(key, data) || '';
        });
        fragment.appendChild(container);

        resolve(fragment);
    }).then(res => {
        /* remove */
        this.templateContainer.parentNode.replaceChild(res, this.templateContainer);
        /*
        this.elem.remove();
        */
        return typeof this.callback === 'function' && this.callback();
    });

}

const slugify = text => text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '_');

function dump(v) {
    return JSON.stringify(v, null, 4);
}

function parseFunction(key, data) {
    switch (key) {
        case 'debug':
            return `<pre style="overflow: auto; max-height: 350px;">${escapeHtml(dump(data))}</pre>`;
        default:
            return '';
    }
}

function createDocumentFragment(inMarkup) {
    var range, fragment, dummy, elem;
    if (document.createRange && (range = document.createRange())
        && range.selectNodeContents
        && range.createContextualFragment) {
        range.collapse(false);
        range.selectNodeContents(document.body);
        fragment = range.createContextualFragment(inMarkup);
    } else {
        dummy = document.createElement('div');
        fragment = document.createDocumentFragment();
        dummy.innerHTML = inMarkup;
        while ((elem = dummy.firstChild)) {
            fragment.appendChild(elem);
        }
    }
    return fragment;
}

function getText(nodeList, target) {
    var trueTarget = target - 1,
        length = nodeList.length; // Because you may have many child nodes.

    for (var i = 0; i < length; i++) {
        if ((nodeList[i].nodeType === Node.TEXT_NODE) && (i === trueTarget)) {
            return nodeList[i].nodeValue;  // Done! No need to keep going.
        }
    }

    return null;
}
const escapeHtml = (unsafe) => {
    return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export default Component;