var Juicy = (function () {
    'use strict';

    // doT.js
    // 2011-2014, Laura Doktorova, https://github.com/olado/doT
    // Licensed under the MIT license.

    var doT = {
        template,
        compile,
        setDelimiters,
    };

    const templateSettings = {
        argName: "it",
        encoders: {},
        selfContained: false,
        strip: true,
        internalPrefix: "_val",
        encodersPrefix: "_enc",
        delimiters: {
            start: "{{",
            end: "}}",
        },
    };

    // depends on selfContained mode
    const encoderType = {
        false: "function",
        true: "string",
    };

    const defaultSyntax = {
        evaluate: /\{\{([\s\S]+?(\}?)+)\}\}/g,
        interpolate: /\{\{=([\s\S]+?)\}\}/g,
        typeInterpolate: /\{\{%([nsb])=([\s\S]+?)\}\}/g,
        encode: /\{\{([a-z_$]+[\w$]*)?!([\s\S]+?)\}\}/g,
        use: /\{\{#([\s\S]+?)\}\}/g,
        useParams: /(^|[^\w$])def(?:\.|\[[\'\"])([\w$\.]+)(?:[\'\"]\])?\s*\:\s*([\w$]+(?:\.[\w$]+|\[[^\]]+\])*|\"[^\"]+\"|\'[^\']+\'|\{[^\}]+\}|\[[^\]]*\])/g,
        define: /\{\{##\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g,
        defineParams: /^\s*([\w$]+):([\s\S]+)/,
        conditional: /\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g,
        iterate: /\{\{~\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g,
    };

    let currentSyntax = { ...defaultSyntax };

    const TYPES = {
        n: "number",
        s: "string",
        b: "boolean",
    };

    function resolveDefs(c, syn, block, def) {
        return (typeof block === "string" ? block : block.toString())
            .replace(syn.define, (_, code, assign, value) => {
                if (code.indexOf("def.") === 0) {
                    code = code.substring(4);
                }
                if (!(code in def)) {
                    if (assign === ":") {
                        value.replace(syn.defineParams, (_, param, v) => {
                            def[code] = { arg: param, text: v };
                        });
                        if (!(code in def)) def[code] = value;
                    } else {
                        new Function("def", `def['${code}']=${value}`)(def);
                    }
                }
                return ""
            })
            .replace(syn.use, (_, code) => {
                code = code.replace(syn.useParams, (_, s, d, param) => {
                    if (def[d] && def[d].arg && param) {
                        const rw = unescape((d + ":" + param).replace(/'|\\/g, "_"));
                        def.__exp = def.__exp || {};
                        def.__exp[rw] = def[d].text.replace(
                            new RegExp(`(^|[^\\w$])${def[d].arg}([^\\w$])`, "g"),
                            `$1${param}$2`
                        );
                        return s + `def.__exp['${rw}']`
                    }
                });
                const v = new Function("def", "return " + code)(def);
                return v ? resolveDefs(c, syn, v, def) : v
            })
    }


    function unescape(code) {
        return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, " ")
    }

    function template(tmpl, c, def) {
        const ds = c && c.delimiters;
        const syn = ds && !sameDelimiters(ds) ? getSyntax(ds) : currentSyntax;
        c = c ? { ...templateSettings, ...c } : templateSettings;
        let sid = 0;
        let str = resolveDefs(c, syn, tmpl, def || {});
        const needEncoders = {};

        str = (
            "let out='" +
            (c.strip
                ? str
                    .trim()
                    .replace(/[\t ]+(\r|\n)/g, "\n") // remove trailing spaces
                    .replace(/(\r|\n)[\t ]+/g, " ") // leading spaces reduced to " "
                    .replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g, "") // remove breaks, tabs and JS comments
                : str
            )
                .replace(/'|\\/g, "\\$&")
                .replace(syn.interpolate, (_, code) => `'+(${unescape(code)})+'`)
                .replace(syn.typeInterpolate, (_, typ, code) => {
                    sid++;
                    const val = c.internalPrefix + sid;
                    const error = `throw new Error("expected ${TYPES[typ]}, got "+ (typeof ${val}))`;
                    return `';const ${val}=(${unescape(code)});if(typeof ${val}!=="${TYPES[typ]
                    }") ${error};out+=${val}+'`
                })
                .replace(syn.encode, (_, enc = "", code) => {
                    needEncoders[enc] = true;
                    code = unescape(code);
                    const e = c.selfContained ? enc : enc ? "." + enc : '[""]';
                    return `'+${c.encodersPrefix}${e}(${code})+'`
                })
                .replace(syn.conditional, (_, elseCase, code) => {
                    if (code) {
                        code = unescape(code);
                        return elseCase ? `';}else if(${code}){out+='` : `';if(${code}){out+='`
                    }
                    return elseCase ? "';}else{out+='" : "';}out+='"
                })
                .replace(syn.iterate, (_, arr, vName, iName) => {
                    if (!arr) return "';} } out+='"
                    sid++;
                    const defI = iName ? `let ${iName}=-1;` : "";
                    const incI = iName ? `${iName}++;` : "";
                    const val = c.internalPrefix + sid;
                    return `';const ${val}=${unescape(
                    arr
                )};if(${val}){${defI}for (const ${vName} of ${val}){${incI}out+='`
                })
                .replace(syn.evaluate, (_, code) => `';${unescape(code)}out+='`) +
            "';return out;"
        )
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t")
            .replace(/\r/g, "\\r")
            .replace(/(\s|;|\}|^|\{)out\+='';/g, "$1")
            .replace(/\+''/g, "");

        const args = Array.isArray(c.argName) ? properties(c.argName) : c.argName;

        if (Object.keys(needEncoders).length === 0) {
            return try_(() => new Function(args, str))
        }
        checkEncoders(c, needEncoders);
        str = `return function(${args}){${str}};`;
        return try_(() =>
            c.selfContained
                ? new Function((str = addEncoders(c, needEncoders) + str))()
                : new Function(c.encodersPrefix, str)(c.encoders)
        )

        function try_(f) {
            try {
                return f()
            } catch (e) {
                console.log("Could not create a template function: " + str);
                throw e
            }
        }
    }

    function compile(tmpl, def) {
        return template(tmpl, null, def)
    }

    function sameDelimiters({ start, end }) {
        const d = templateSettings.delimiters;
        return d.start === start && d.end === end
    }

    function setDelimiters(delimiters) {
        if (sameDelimiters(delimiters)) {
            console.log("delimiters did not change");
            return
        }
        currentSyntax = getSyntax(delimiters);
        templateSettings.delimiters = delimiters;
    }

    function getSyntax({ start, end }) {
        start = escape(start);
        end = escape(end);
        const syntax = {};
        for (const syn in defaultSyntax) {
            const s = defaultSyntax[syn]
                .toString()
                .replace(/\\\{\\\{/g, start)
                .replace(/\\\}\\\}/g, end);
            syntax[syn] = strToRegExp(s);
        }
        return syntax
    }

    const escapeCharacters = /([{}[\]()<>\\\/^$\-.+*?!=|&:])/g;

    function escape(str) {
        return str.replace(escapeCharacters, "\\$1")
    }

    const regexpPattern = /^\/(.*)\/([\w]*)$/;

    function strToRegExp(str) {
        const [, rx, flags] = str.match(regexpPattern);
        return new RegExp(rx, flags)
    }

    function properties(args) {
        return args.reduce((s, a, i) => s + (i ? "," : "") + a, "{") + "}"
    }

    function checkEncoders(c, encoders) {
        const typ = encoderType[c.selfContained];
        for (const enc in encoders) {
            const e = c.encoders[enc];
            if (!e) throw new Error(`unknown encoder "${enc}"`)
            if (typeof e !== typ)
                throw new Error(`selfContained ${c.selfContained}: encoder type must be "${typ}"`)
        }
    }

    function addEncoders(c, encoders) {
        let s = "";
        for (const enc in encoders) s += `const ${c.encodersPrefix}${enc}=${c.encoders[enc]};`;
        return s
    }

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

<<<<<<< HEAD
        /*
        this.parseVars()
        */
=======
  function unescape(code) {
    return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, " ")
  }
  
  function testCode(code) {
    try {
      if(code) return code;
    } catch(e) { 
      return ''; 
    } finally { 
      return code;
    }
  }
>>>>>>> 7e463684ccd9ba1a49f29cb150c77c440da4af29

        console.log(obj);
        return obj;
    };

<<<<<<< HEAD
=======
    str = (
      "let out='" +
      (c.strip
        ? str
            .trim()
            .replace(/[\t ]+(\r|\n)/g, "\n") // remove trailing spaces
            .replace(/(\r|\n)[\t ]+/g, " ") // leading spaces reduced to " "
            .replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g, "") // remove breaks, tabs and JS comments
        : str
      )
        .replace(/'|\\/g, "\\$&")
        .replace(syn.interpolate, (_, code) => `'+(${unescape(testCode(code))})+'`)
        .replace(syn.typeInterpolate, (_, typ, code) => {
          sid++;
          const val = c.internalPrefix + sid;
          const error = `throw new Error("expected ${TYPES[typ]}, got "+ (typeof ${val}))`;
          return `';const ${val}=(${unescape(code)});if(typeof ${val}!=="${
          TYPES[typ]
        }") ${error};out+=${val}+'`
        })
        .replace(syn.encode, (_, enc = "", code) => {
          needEncoders[enc] = true;
          code = unescape(code);
          const e = c.selfContained ? enc : enc ? "." + enc : '[""]';
          return `'+${c.encodersPrefix}${e}(${code})+'`
        })
        .replace(syn.conditional, (_, elseCase, code) => {
          if (code) {
            code = unescape(code);
            return elseCase ? `';}else if(${code}){out+='` : `';if(${code}){out+='`
          }
          return elseCase ? "';}else{out+='" : "';}out+='"
        })
        .replace(syn.iterate, (_, arr, vName, iName) => {
          if (!arr) return "';} } out+='"
          sid++;
          const defI = iName ? `let ${iName}=-1;` : "";
          const incI = iName ? `${iName}++;` : "";
          const val = c.internalPrefix + sid;
          return `';const ${val}=${unescape(
          arr
        )};if(${val}){${defI}for (const ${vName} of ${val}){${incI}out+='`
        })
        .replace(syn.evaluate, (_, code) => `';${unescape(code)}out+='`) +
      "';return out;"
    )
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r")
      .replace(/(\s|;|\}|^|\{)out\+='';/g, "$1")
      .replace(/\+''/g, "");
>>>>>>> 7e463684ccd9ba1a49f29cb150c77c440da4af29

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
                        label: this.trimLabels(children[0].innerText),
                        value: children[1].firstChild.innerHTML
                    }
                };
            case 'contact':
                let value = this.queryable(children[1]).querySelector('a');
                return {
                    contact: {
                        label: this.trimLabels(children[0].innerText),
                        value: value ? value.outerHTML : ''
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
                    });
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
                        label: this.trimLabels(children[0].innerText),
                        value: children[1].firstChild.innerHTML
                    }
                };
        }
        return {};
    };

    Component.prototype.queryable = function(collection) {
        let fragment = new DocumentFragment();
        let div = document.createElement('div');
        div.innerHTML = collection.innerHTML;
        fragment.appendChild(div);
        return fragment;
    };

    Component.prototype.trimLabels = function (text) {
        return text.replace(/:|\*/, '').trim();
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
            container.classList.add('juicy-container', 'juicy-rendered');
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

    };

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
    const escapeHtml = (unsafe) => {
        return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    };

    return Component;

})();
