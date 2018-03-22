const settings = require('electron-settings');
const {shell} = require('electron');
const {dialog} = require('electron').remote;
const Vue = require('../lib/vue.min.js');
const moment = require('../lib/moment.js');
const fs = require("fs");
const path = require('path');
const nodemailer = require('nodemailer');

const EXCLUDE = ['.DS_Store', '.mapping', 'pushBulletNotifications.xml', 'update.txt', '[三雲岳斗][strike the blood][噬血狂襲]', '同級生.txt', '@R18', 'cover.jpg'];


/* ------------------
    init
   ------------------ */

var app = new Vue({
    el: '#wrapper',
    data: {
        status: {
            currentNovel: null,
        },
        keyword: '',
        novels: [],
        config: {
            path2Dropbox: null,
            SMTPUsername: null,
            SMTPPassword: null,
            email: null,
        },
        rules: {
            exclude: [],
        }
    },
    mounted: function() {
        document.querySelector('#wrapper').style.display = 'block';
        this.rules.exclude = EXCLUDE;
        this.reloadConfig();
    },
    filters: {
        moment: function (date, format) {
            return moment(date).format(format);
        }
    },
    computed: {
        keywordNovel: function() {
            let _novels = [];
            this.novelSelect(null);
            if (this.keyword.length < 1) {
                _novels = this.novels;
            }
            else {
                for(let novel of this.novels) {
                    if (novel.title.indexOf(this.keyword) !== -1) {
                        _novels.push(novel)
                    }
                }
            }
            _novels.sort(function(a, b) {
                if (a.ctime > b.ctime) {
                    return -1;
                }
                if (a.ctime < b.ctime) {
                    return 1;
                }
                return 0;
            });

            return _novels;
        },
        currentNovelItems: function() {
            let _this = this;
            let _items = [];

            if (this.status.currentNovel) {
                let novel = this.status.currentNovel;
                let dir = fs.readdirSync(path.join(this.config.path2Dropbox.toString(), novel.folder));
                dir = dir.filter(item => !_this.rules.exclude.includes(item));
                dir = dir.filter(item => item.indexOf('.txt') > 0);
                for(let d of dir) {
                    let item = {
                        filename: d,
                        title: path.basename(d, '.txt')
                    };

                    _items.push(item);
                }
            }

            return _items;
        },
    },
    methods: {
        reloadConfig: function() {
            if (settings.has('path2Dropbox')) {
                this.config.path2Dropbox = settings.get('path2Dropbox');
                this.refreshNovel();
            }

            if (settings.has('SMTPUsername') && settings.has('SMTPPassword')) {
                this.config.SMTPUsername = settings.get('SMTPUsername');
                this.config.SMTPPassword = settings.get('SMTPPassword');
            }

            if (settings.has('email')) {
                this.config.email = settings.get('email');
            }
        },
        refreshNovel: function() {
            let _this = this;
            fs.readdir(this.config.path2Dropbox.toString(), (err, dir) => {
                let novels = [];
                let st = null;
                dir = dir.filter(item => !_this.rules.exclude.includes(item))
                for(let d of dir) {

                    let novel = {
                        title: this.normalizeTitle(d),
                        ctime: null,
                        folder: d,
                        cover: path.join(__dirname, '../../assets/img/nocover.jpg'),
                    };

                    st = fs.statSync(path.join(this.config.path2Dropbox.toString(), d));
                    novel.ctime = st.ctime;

                    st = path.join(this.config.path2Dropbox.toString(), d, 'cover.jpg');
                    if (fs.existsSync(st)) {
                        novel.cover = path.join(this.config.path2Dropbox.toString(), encodeURIComponent(d), 'cover.jpg');
                    }

                    novels.push(novel);
                }
                Vue.set(this, 'novels', novels);
            });
        },
        novelSelect: function(novel) {
            this.status.currentNovel = novel;
        },
        normalizeTitle: function(input) {
            if (input.charAt(0) === '_') {
                return input.split('-')[1];
            }

            return input.trim();
        },
        openInFinder: function(folder, event) {
            event.stopPropagation();
            folder = path.join(this.config.path2Dropbox, folder);
            result = shell.openItem(folder);
        },
        /* ------------------
         * setting
         * ------------------ */
        selectPathDropbox: function(event) {
            let path = dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (typeof(path) !== 'undefined') {
                event.target.value = path;
            }
        },
        onSettingSubmit: function(event) {
            settings.set('path2Dropbox', event.target.elements.path2Dropbox.value);
            settings.set('SMTPUsername', event.target.elements.SMTPUsername.value);
            settings.set('SMTPPassword', event.target.elements.SMTPPassword.value);
            settings.set('email', event.target.elements.email.value);
            modal(null, false);
            this.reloadConfig();
            notification('設定已更新');
        },
        /* ------------------
         * modal
         * ------------------ */
        modal: function(el, open) {
            modal(el, open);
        },
        /* ------------------
         * notification
         * ------------------ */
        notification: function(msg) {
            notification(msg);
        },
        /* ------------------
         * email
         * ------------------ */
        sendToEmail: function(mobiPath) {
            let _this = this;

            this.notification('發送 mobi 檔到 ' + _this.config.email);

            const transporter = nodemailer.createTransport({
                service: 'Mailjet',
                auth: {
                    user: _this.config.SMTPUsername,
                    pass: _this.config.SMTPPassword,
                }
            });

            var mailOptions = {
                from: 'Kindlize <kindlize@chrisliu.net>',
                to: _this.config.email,
                subject: 'Sending ebook from Kindlize app',
                text: 'Sending ebook from Kindlize app',
                attachments: [
                    { path: mobiPath }
                ]
            };

            transporter.sendMail(mailOptions, function (err, info) {
               if(err)
                    this.notification('發送失敗');
               else
                    this.notification('發送成功');
            });
        },
        /* ------------------
         * ebook
         * ------------------ */
         novelItemClick: function(novel, item) {
            var _this = this;
            _this.uploadToEbookCdict(novel, item).then(function(mobiPath){
                _this.sendToEmail(mobiPath);
            });
         },
         uploadToEbookCdict: async function(novel, item) {
            let _this = this;

            let res = await fetch('http://ebook.cdict.info/mobi/');
            let html = await res.text();
            let progressKey = html.match(/progress_key=([a-zA-Z0-9]+)/)[1];

            let novelPath = path.join(_this.config.path2Dropbox.toString(), novel.folder, item.filename);
            let outputPath = path.join(_this.config.path2Dropbox.toString(), novel.folder, item.title + '.mobi');

            if (fs.existsSync(outputPath)) {
                return outputPath;
            }

            this.notification('將文字檔上傳到天火…');

            res = await fetch('http://ebook.cdict.info/mobi/revalid.php?progress_key=' + progressKey);
            html = await res.text();

            let data = new FormData();
            data.append('APC_UPLOAD_PROGRESS', progressKey);
            data.append('progress_key', progressKey);
            data.append('title', item.title);
            data.append('author', '');
            data.append('font', 'hei');
            data.append('country', 'tw');
            data.append('part', '0');
            data.append('contents', '1');
            data.append('transfer', 'USB');
            data.append('cover_file', new Blob([fs.readFileSync(decodeURIComponent(novel.cover))], { type: "image/jpg"}));
            data.append('txt_file', new Blob([fs.readFileSync(novelPath, 'UTF-8')], { type: "text/plain"}));

            res = await fetch('http://ebook.cdict.info/mobi/target.php', {
                method: 'POST',
                body: data,
            });

            html = await res.text();
            if (html === "0") return;

            res = await fetch('http://ebook.cdict.info/mobi/getprogress.php?progress_key=' + progressKey);
            html = await res.text();

            res = await fetch('http://ebook.cdict.info/mobi/chkfile.php?progress_key=' + progressKey);
            html = await res.text();

            res = await fetch('http://ebook.cdict.info/mobi/recode_file.php?progress_key=' + progressKey + '&code=UTF-8');
            html = await res.text();

            res = await fetch('http://ebook.cdict.info/mobi/gen_mobi.php?progress_key=' + progressKey);
            html = await res.text();

            res = await fetch('http://ebook.cdict.info/mobi/getprogress.php?progress_key=' + progressKey);
            html = await res.text();

            this.notification('從天火下載檔案…');

            res = await fetch('http://ebook.cdict.info/mobi/download.php?progress_key=' + progressKey);
            html = await res.arrayBuffer();

            fs.appendFileSync(outputPath, new Buffer(html));
            return outputPath;
         },
    }
});

window.modal = function(el, open) {
    var elements = document.querySelectorAll('.modal');

    [].forEach.call(elements, function(el) {
        el.classList.remove("active");
    });

    if (open) {
        elements = document.querySelectorAll('.modal' + el);
        [].forEach.call(elements, function(el) {
            el.classList.add("active");
        });
    }
};

window.notification = function(msg) {
    let _notificaiton = document.getElementById('notification');
    clearTimeout(window.notify);
    _notificaiton.classList.add('active');
    _notificaiton.innerHTML = msg;
    window.notify = setTimeout(function() {
        document.getElementById('notification').classList.remove('active');
    }, 2000);
};