import { settings } from './setting/Settings'
import { nameRuleManager } from './setting/NameRuleManager'
import { store } from './store/Store'
import { Result } from './store/StoreType'
import { Config } from './config/Config'
import { DateFormat } from './utils/DateFormat'
import { Utils } from './utils/Utils'
import { Tools } from './Tools'

// 生成文件名
class FileName {
  // 下载器所有的动图文件名后缀
  private readonly ugoiraExt = ['zip', 'webm', 'gif', 'png']

  private readonly addStr = '[downloader_add]'

  // 生成 {rank} 标记的值
  private createRank(rank: number | null): string {
    // 处理空值
    if (rank === null) {
      return ''
    }
    // string 是旧版本中使用的，以前抓取结果里的 rank 直接就是 '#1' 这样的字符串，后来改成了数字类型
    if (typeof rank === 'string') {
      return rank
    }
    // 其他的情况则应该是期望的值（数字类型）
    return '#' + rank
  }

  // 生成 {p_num} 标记的值
  private createPNum(data: Result) {
    const index = data.index ?? Tools.getResultIndex(data)

    // 处理第一张图不带序号的情况
    if (index === 0 && settings.noSerialNo) {
      return ''
    }

    // 只有插画和漫画有编号
    if (data.type === 0 || data.type === 1) {
      const p = index.toString()
      // 根据需要在前面填充 0
      return settings.zeroPadding
        ? p.padStart(settings.zeroPaddingLength, '0')
        : p
    } else {
      // 其他类型没有编号，返回空字符串
      return ''
    }
  }

  // 生成 {id} 标记的值
  private createId(data: Result) {
    const index = data.index ?? Tools.getResultIndex(data)

    // 处理第一张图不带序号的情况
    if (index === 0 && settings.noSerialNo) {
      return data.idNum.toString()
    }

    if (!settings.zeroPadding) {
      return data.id
    } else {
      // 需要填充 0 的情况
      // 只有插画和漫画有编号
      if (data.type === 0 || data.type === 1) {
        return (
          data.idNum +
          '_p' +
          index.toString().padStart(settings.zeroPaddingLength, '0')
        )
      } else {
        // 其他类型没有编号，所以不会进行填充，直接返回 id
        return data.id
      }
    }
  }

  // 返回收藏数的简化显示
  private getBKM1000(bmk: number): string {
    if (bmk < 1000) {
      return '0+'
    } else {
      // 1000 以上，以 1000 为单位
      const str = bmk.toString()
      return str.slice(0, str.length - 3) + '000+'
    }
  }

  // 在文件名前面添加一层文件夹
  // appendFolder 方法会对非法字符进行处理（包括处理路径分隔符 / 这主要是因为 tags 可能含有斜线 /，需要替换）
  private appendFolder(fullPath: string, folderName: string): string {
    const allPart = fullPath.split('/')
    allPart.splice(allPart.length - 1, 0, Utils.replaceUnsafeStr(folderName))
    return allPart.join('/')
  }

  // 不能出现在文件名开头的一些特定字符
  private readonly checkStartCharList = ['/', ' ']

  // 检查文件名开头是否含有特定字符
  private checkStartChar(str: string) {
    for (const check of this.checkStartCharList) {
      if (str.startsWith(check)) {
        return true
      }
    }
    return false
  }

  // 移除文件名开头的特定字符
  private removeStartChar(str: string) {
    while (this.checkStartChar(str)) {
      for (const check of this.checkStartCharList) {
        if (str.startsWith(check)) {
          str = str.replace(check, '')
        }
      }
    }
    return str
  }

  // 传入命名规则和所有标记，生成文件名
  private generateFileName(rule: string, cfg: Object) {
    let result = rule
    // 把命名规则里的标记替换成实际值
    for (const [key, val] of Object.entries(cfg)) {
      if (rule.includes(key)) {
        // 空值替换成空字符串
        let temp = val.value ?? ''

        // 如果这个值不是字符串类型则转换为字符串
        temp = typeof temp !== 'string' ? temp.toString() : temp

        // 替换不可以作为文件名的特殊字符
        if (!val.safe) {
          temp = Utils.replaceUnsafeStr(temp)
        }

        // 添加标记前缀
        if (settings.tagNameToFileName) {
          temp = val.prefix + temp
        }

        // 将标记替换成结果，如果有重复的标记，全部替换
        result = result.replace(new RegExp(key, 'g'), temp)
      }
    }

    // 处理文件名里的一些边界情况

    // 如果文件名开头不可用的特殊字符
    result = this.removeStartChar(result)
    // 测试用例
    // const testStr = ' / / {p_tag} / {p_title} /{id}-{user}'
    // console.log(this.removeStartChar(testStr))

    // 如果文件名的尾部是 / 则去掉
    if (result.endsWith('/')) {
      result = result.substr(0, result.length - 1)
    }

    // 处理连续的 /
    result = result.replace(/\/{2,100}/g, '/')

    return result
  }

  // 传入一个抓取结果，获取其文件名
  public getFileName(data: Result) {
    // 命名规则
    const userSetName = nameRuleManager.rule

    // 判断是否要为每个作品创建单独的文件夹
    let createFolderForEachWork =
      settings.workDir && data.dlCount > settings.workDirFileNumber

    const allNameRule =
      userSetName + (createFolderForEachWork ? settings.workDirNameRule : '')

    // 1 生成所有命名标记的值
    // 对于一些较为耗时的计算，先判断用户设置的命名规则里是否使用了这个标记，如果未使用则不计算
    const cfg = {
      '{p_title}': {
        value: store.title,
        prefix: '',
        safe: false,
      },
      '{p_tag}': {
        value: store.tag,
        prefix: '',
        safe: false,
      },
      '{id}': {
        value: this.createId(data),
        prefix: '',
        safe: true,
      },
      '{id_num}': {
        value: data.idNum || parseInt(data.id),
        prefix: '',
        safe: true,
      },
      '{p_num}': {
        value: !allNameRule.includes('{p_num}') ? null : this.createPNum(data),
        prefix: '',
        safe: true,
      },
      '{rank}': {
        value: !allNameRule.includes('{rank}')
          ? null
          : this.createRank(data.rank),
        prefix: '',
        safe: true,
      },
      '{title}': {
        value: data.title,
        prefix: 'title_',
        safe: false,
      },
      '{user}': {
        value: data.user,
        prefix: 'user_',
        safe: false,
      },
      '{userid}': {
        value: data.userId,
        prefix: 'uid_',
        safe: true,
      },
      '{user_id}': {
        value: data.userId,
        prefix: 'uid_',
        safe: true,
      },
      '{px}': {
        value: !allNameRule.includes('{px}')
          ? null
          : data.fullWidth
          ? data.fullWidth + 'x' + data.fullHeight
          : '',
        prefix: '',
        safe: true,
      },
      '{tags}': {
        value: !allNameRule.includes('{tags}') ? null : data.tags.join(','),
        prefix: 'tags_',
        safe: false,
      },
      '{tags_translate}': {
        value: !allNameRule.includes('{tags_translate}')
          ? null
          : data.tagsWithTransl.join(','),
        prefix: 'tags_',
        safe: false,
      },
      '{tags_transl_only}': {
        value: !allNameRule.includes('{tags_transl_only}')
          ? null
          : data.tagsTranslOnly.join(','),
        prefix: 'tags_',
        safe: false,
      },
      '{bmk}': {
        value: data.bmk,
        prefix: 'bmk_',
        safe: true,
      },
      '{bmk_1000}': {
        value: this.getBKM1000(data.bmk),
        prefix: 'bmk_',
        safe: true,
      },
      '{like}': {
        value: data.likeCount,
        prefix: 'like_',
        safe: true,
      },
      '{view}': {
        value: data.viewCount,
        prefix: 'view_',
        safe: true,
      },
      '{date}': {
        value: !allNameRule.includes('{date}')
          ? null
          : DateFormat.format(data.date, settings.dateFormat),
        prefix: '',
        safe: false,
      },
      '{task_date}': {
        value: !allNameRule.includes('{task_date}')
          ? null
          : DateFormat.format(store.crawlCompleteTime, settings.dateFormat),
        prefix: '',
        safe: false,
      },
      '{type}': {
        value: Config.worksTypeName[data.type],
        prefix: '',
        safe: true,
      },
      '{series_title}': {
        value: data.seriesTitle || '',
        prefix: '',
        safe: false,
      },
      '{series_order}': {
        value: data.seriesOrder === null ? '' : '#' + data.seriesOrder,
        prefix: '',
        safe: true,
      },
    }

    // 2 生成文件名
    let result = this.generateFileName(userSetName, cfg)

    // 3 根据某些设置向结果中添加新的文件夹
    // 注意：添加文件夹的顺序会影响文件夹的层级，所以不可随意更改顺序

    // 根据作品类型自动创建对应的文件夹
    if (settings.createFolderByType) {
      // 根据作品类型和对应开关确定是否需要要为其建立文件夹
      const allSwitch = [
        settings.createFolderByTypeIllust,
        settings.createFolderByTypeManga,
        settings.createFolderByTypeUgoira,
        settings.createFolderByTypeNovel,
      ]
      if (allSwitch[data.type]) {
        const folder = Config.worksTypeName[data.type]
        result = this.appendFolder(result, folder)
      }
    }

    // 根据 sl 创建文件夹
    if (settings.createFolderBySl && data.sl !== null) {
      const folder = 'sl' + data.sl.toString()
      result = this.appendFolder(result, folder)
    }

    // 根据第一个匹配的 tag 建立文件夹
    if (settings.createFolderByTag && settings.createFolderTagList.length > 0) {
      const workTags = data.tagsWithTransl.map((val) => val.toLowerCase())

      // 循环用户输入的 tag 列表，查找作品 tag 是否含有匹配项
      // 这样用户输入的第一个匹配的 tag 就会作为文件夹名字
      // 不要循环作品 tag 列表，因为那样找到的第一个匹配项未必是用户输入的第一个
      // 例如 用户输入顺序：巨乳 欧派
      // 作品 tag 里的顺序：欧派 巨乳
      for (const tag of settings.createFolderTagList) {
        // 查找匹配的时候转换成小写
        const nowTag = tag.toLowerCase()
        if (workTags.includes(nowTag)) {
          // 设置为文件夹名字的时候使用原 tag（不转换成小写）
          result = this.appendFolder(result, tag)
          break
        }
      }
    }

    // 把 R18(G) 作品存入指定目录里
    if (settings.r18Folder && (data.xRestrict === 1 || data.xRestrict === 2)) {
      result = this.appendFolder(result, settings.r18FolderName)
    }

    // 为每个作品创建单独的文件夹
    if (createFolderForEachWork) {
      const workDirName = this.generateFileName(settings.workDirNameRule, cfg)
      // 生成文件名。由于用户可能会添加斜线来建立多层路径，所以需要循环添加每个路径
      const allPath = workDirName.split('/')
      for (const path of allPath) {
        if (path.length > 0) {
          result = this.appendFolder(result, path)
        }
      }
    }

    // 4 文件夹部分和文件名已经全部生成完毕，处理一些边界情况

    // 处理连续的 / 有时候两个斜线中间的字段是空值，最后就变成两个斜线挨在一起了
    result = result.replace(/\/{2,100}/g, '/')

    // 对每一层路径和文件名进行处理
    const pathArray = result.split('/')

    for (let i = 0; i < pathArray.length; i++) {
      let str = pathArray[i]

      // 去掉每层路径首尾的空格
      // 把每层路径头尾的 . 替换成全角的．因为 Chrome 不允许头尾使用 .
      str = str.trim().replace(/^\./g, '．').replace(/\.$/g, '．')

      // 处理路径是 Windows 保留文件名的情况（不需要处理后缀名）
      str = Utils.handleWindowsReservedName(str, this.addStr)

      pathArray[i] = str
    }

    result = pathArray.join('/')

    // 5 生成后缀名
    // 如果是动图，那么此时根据用户设置的动图保存格式，更新其后缀名
    if (
      this.ugoiraExt.includes(data.ext) &&
      data.ugoiraInfo &&
      settings.imageSize !== 'thumb'
    ) {
      // 当下载图片的方形缩略图时，不修改其后缀名，因为此时下载的是作品的静态缩略图，不是动图
      data.ext = settings.ugoiraSaveAs
    }
    // 如果是小说，那么此时根据用户设置的动图保存格式，更新其后缀名
    if (data.type === 3) {
      data.ext = settings.novelSaveAs
    }
    const extResult = '.' + data.ext

    // 6 文件名长度限制
    // 去掉文件夹部分，只处理 文件名+后缀名 部分
    // 理论上文件夹部分也可能会超长，但是实际使用中几乎不会有人这么设置，所以不处理
    if (settings.fileNameLengthLimitSwitch) {
      let limit = settings.fileNameLengthLimit
      const allPart = result.split('/')
      const lastIndex = allPart.length - 1

      if (allPart[lastIndex].length + extResult.length > limit) {
        allPart[lastIndex] = allPart[lastIndex].substr(
          0,
          limit - extResult.length
        )
      }

      result = allPart.join('/')
    }

    // 7 添加后缀名
    result += extResult

    // 8 返回结果
    return result
  }
}

const fileName = new FileName()
export { fileName }
