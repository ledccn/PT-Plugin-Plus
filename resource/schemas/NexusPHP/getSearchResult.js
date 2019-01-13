if (!"".getQueryString) {
  String.prototype.getQueryString = function (name, split) {
    if (split == undefined) split = "&";
    var reg = new RegExp(
        "(^|" + split + "|\\?)" + name + "=([^" + split + "]*)(" + split + "|$)"
      ),
      r;
    if ((r = this.match(reg))) return decodeURI(r[2]);
    return null;
  };
}

(function (options) {
  class Parser {
    constructor() {
      this.haveData = false;
      if (/takelogin\.php/.test(options.responseText)) {
        options.errorMsg = `[${options.site.name}]需要登录后再搜索`;
        return;
      }
      if (/没有种子|No [Tt]orrents?|Your search did not match anything|用准确的关键字重试/.test(options.responseText)) {
        options.errorMsg = `[${options.site.name}]没有搜索到相关的种子`;
        return;
      }

      this.haveData = true;
    }

    /**
     * 获取搜索结果
     */
    getResult() {
      if (!this.haveData) {
        return [];
      }
      let site = options.site;
      // 获取种子列表行
      let rows = options.page.find(options.resultSelector || "table.torrents:last > tbody > tr");
      if (rows.length == 0) {
        options.errorMsg = `[${options.site.name}]没有定位到种子列表，或没有相关的种子`;
        return [];
      }
      let results = [];
      // 获取表头
      let header = rows.eq(0).find("th,td");

      // 用于定位每个字段所列的位置
      let fieldIndex = {
        time: -1,
        size: -1,
        seeders: -1,
        leechers: -1,
        completed: -1,
        comments: -1,
        // 最后一栏确定为发布人
        author: header.length - 1
      };

      if (site.url.lastIndexOf("/") != site.url.length - 1) {
        site.url += "/";
      }

      // 获取字段所在的列
      for (let index = 0; index < header.length; index++) {
        const cell = header.eq(index);

        // 评论数
        if (cell.find("img.comments").length) {
          fieldIndex.comments = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 发布时间
        if (cell.find("img.time").length) {
          fieldIndex.time = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 大小
        if (cell.find("img.size").length) {
          fieldIndex.size = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 种子数
        if (cell.find("img.seeders").length) {
          fieldIndex.seeders = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 下载数
        if (cell.find("img.leechers").length) {
          fieldIndex.leechers = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 完成数
        if (cell.find("img.snatched").length) {
          fieldIndex.completed = index;
          fieldIndex.author = index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }
      }

      try {
        // 遍历数据行
        for (let index = 1; index < rows.length; index++) {
          const row = rows.eq(index);
          let cells = row.find(">td");

          let title = row.find("a[href*='hit'][title]").first();
          if (title.length == 0) {
            title = row.find("a[href*='hit']").first();
          }
          let link = title.attr("href");
          if (link.substr(0, 4) !== "http") {
            link = `${site.url}${link}`;
          }

          // 获取下载链接
          let url = row.find("img.download").parent();

          if (url.length) {
            if (url.get(0).tagName !== "A") {
              let id = link.getQueryString("id");
              url = `download.php?id=${id}`;
            } else {
              url = url.attr("href");
            }
          } else {
            let id = link.getQueryString("id");
            url = `download.php?id=${id}`;
          }

          if (url.substr(0, 4) !== "http") {
            url = `${site.url}${url}`;
          }

          let data = {
            title: title.attr("title") || title.text(),
            subTitle: this.getSubTitle(title, row),
            link,
            url: url + (site && site.passkey ? "&passkey=" + site.passkey : ""),
            size: cells.eq(fieldIndex.size).html() || 0,
            time: fieldIndex.time == -1 ? "" : cells.eq(fieldIndex.time).find("span[title],time[title]").attr("title") || cells.eq(fieldIndex.time).text() || "",
            author: fieldIndex.author == -1 ? "" : cells.eq(fieldIndex.author).text() || "",
            seeders: fieldIndex.seeders == -1 ? "" : cells.eq(fieldIndex.seeders).text() || 0,
            leechers: fieldIndex.leechers == -1 ? "" : cells.eq(fieldIndex.leechers).text() || 0,
            completed: fieldIndex.completed == -1 ? "" : cells.eq(fieldIndex.completed).text() || 0,
            comments: fieldIndex.comments == -1 ? "" : cells.eq(fieldIndex.comments).text() || 0,
            site: site,
            tags: this.getTags(row, options.torrentTagSelectors)
          };
          results.push(data);
        }
      } catch (error) {
        options.errorMsg = `[${options.site.name}]获取种子信息出错: ${error.stack}`;
      }

      return results;
    }

    /**
     * 获取标签
     * @param {*} row 
     * @param {*} selectors 
     * @return array
     */
    getTags(row, selectors) {
      let tags = [];
      if (selectors && selectors.length > 0) {
        selectors.forEach(item => {
          if (item.selector) {
            let result = row.find(item.selector)
            if (result.length) {
              tags.push({
                name: item.name,
                color: item.color
              });
            }
          }
        });
      }
      return tags;
    }

    /**
     * 获取副标题
     * @param {*} title 
     * @param {*} row 
     */
    getSubTitle(title, row) {
      let subTitle = title.parent().html().split("<br>");
      if (subTitle && subTitle.length > 1) {
        subTitle = $("<span>").html(subTitle[subTitle.length - 1]).text();
      } else {
        // 特殊情况处理
        switch (options.site.host) {
          case "hdchina.org":
            if (title.parent().next().is("h4")) {
              subTitle = title.parent().next().text();
              break;
            }

          case "tp.m-team.cc":
            title = row.find("a[href*='hit'][title]").last();
            subTitle = title.parent().html().split("<br>");
            subTitle = $("<span>").html(subTitle[subTitle.length - 1]).text();
            break;

        }
      }

      return subTitle || "";
    }
  }

  let parser = new Parser(options)
  options.results = parser.getResult()
  console.log(options.results);
})(options)