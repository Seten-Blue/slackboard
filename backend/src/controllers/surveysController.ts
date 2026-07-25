import { Response } from 'express';
import mongoose from 'mongoose';
import Survey, { ISurvey } from '../models/Survey';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { logAction } from './auditLogController';

export const createSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const io = req.app.get('io');

    const {
      title,
      description,
      channel,
      questions,
      anonymous,
      allowMultipleResponses,
      expiresAt,
      targetUsers,
    } = req.body;

    if (!title || !questions || !questions.length) {
      return res
        .status(400)
        .json({ success: false, message: 'title y questions son requeridos' });
    }

    const survey = await Survey.create({
      title,
      description: description || '',
      creator: userId,
      channel: channel || null,
      questions,
      anonymous: anonymous ?? false,
      allowMultipleResponses: allowMultipleResponses ?? false,
      expiresAt: expiresAt || null,
      targetUsers: targetUsers || [],
      status: 'active',
    });

    const populated = await Survey.findById(survey._id)
      .populate('creator', 'username email avatar')
      .populate('channel', 'name platform')
      .lean() as any;

    // Agregar responseCount manualmente (lean() no incluye virtuales)
    populated.responseCount = 0;

    if (channel && io) {
      io.to(channel.toString()).emit('new-survey', {
        channelId: channel.toString(),
        survey: populated,
      });
      io.to(channel.toString()).emit('survey-response-updated', {
        surveyId: survey._id,
        responseCount: 0,
      });
    }

    // Crear mensaje tipo poll en el chat
    const targetChannelId = channel ? (() => { try { return new mongoose.Types.ObjectId(channel); } catch { return null; } })() : null;
    if (targetChannelId) {
      let pollOptions: { emoji: string; text: string; voters: never[] }[] = [];

      const firstQ = questions[0];
      if (firstQ && (firstQ.type === 'single_choice' || firstQ.type === 'multiple_choice') && firstQ.options?.length) {
        pollOptions = firstQ.options.map((opt: string) => ({
          emoji: '',
          text: opt,
          voters: [],
        }));
      } else if (firstQ && firstQ.type === 'yes_no') {
        pollOptions = [
          { emoji: '', text: 'Si', voters: [] },
          { emoji: '', text: 'No', voters: [] },
        ];
      } else if (firstQ && firstQ.type === 'rating') {
        pollOptions = Array.from({ length: firstQ.maxRating || 5 }, (_, i) => ({
          emoji: '',
          text: `${i + 1} ★`,
          voters: [],
        }));
      } else {
        pollOptions = [{ emoji: '', text: 'Ver encuesta', voters: [] }];
      }

      let pollExpiresAt: Date | null = null;
      if (expiresAt) {
        pollExpiresAt = new Date(expiresAt);
      }

      const chatMsg = await Message.create({
        content: `📊 ${title}`,
        channel: targetChannelId,
        sender: userId,
        type: 'poll',
        pollData: {
          question: title,
          options: pollOptions,
          allowMultiple: false,
          isAnonymous: anonymous ?? false,
          duration: 0,
          createdBy: userId,
          expiresAt: pollExpiresAt,
          surveyId: survey._id,
        },
      });

      if (io) {
        const populatedMsg = await Message.findById(chatMsg._id)
          .populate('sender', 'username email avatar status role');
        io.to(targetChannelId.toString()).emit('new-message', {
          channelId: targetChannelId.toString(),
          message: populatedMsg,
        });
      }
    }

    logAction(userId, 'survey.created', 'create', survey._id.toString(), 'Survey',
      { title, questionsCount: questions.length, channel: channel || null },
      req.ip, req.headers['user-agent']);

    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al crear encuesta',
      error: error.message,
    });
  }
};

export const getSurveys = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {
      $or: [{ creator: userId }, { targetUsers: userId }],
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.creator) {
      filter.creator = req.query.creator;
    }
    if (req.query.channel) {
      filter.channel = req.query.channel;
    }

    const [surveys, total] = await Promise.all([
      Survey.find(filter)
        .populate('creator', 'username email avatar')
        .populate('channel', 'name platform')
        .populate('targetUsers', 'username email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Survey.countDocuments(filter),
    ]);

    // Agregar responseCount manualmente (lean() no incluye virtuales)
    const surveysWithCount = surveys.map((s: any) => ({
      ...s,
      responseCount: s.responses ? s.responses.length : 0,
    }));

    res.json({
      success: true,
      data: surveysWithCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener encuestas',
      error: error.message,
    });
  }
};

export const getSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId)
      .populate('creator', 'username email avatar')
      .populate('channel', 'name platform')
      .populate('targetUsers', 'username email avatar')
      .populate('responses.respondent', 'username email avatar')
      .lean() as any;

    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const s = survey as any;
    const creatorId = s.creator?._id?.toString() || s.creator?.toString() || '';
    const isCreator = creatorId === userId;
    const isTarget = s.targetUsers.some((u: any) => (u._id?.toString() || u.toString()) === userId);
    const hasResponse = s.responses.some((r: any) => {
      const respId = r.respondent?._id?.toString() || r.respondent?.toString() || '';
      return respId === userId;
    });

    if (!isCreator && !isTarget && !hasResponse) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta encuesta' });
    }

    if (s.status === 'draft' && !isCreator) {
      return res.status(403).json({ success: false, message: 'Esta encuesta aun no esta activa' });
    }

    // Agregar responseCount manualmente (lean() no incluye virtuales)
    survey.responseCount = survey.responses ? survey.responses.length : 0;

    res.json({ success: true, data: survey });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener encuesta',
      error: error.message,
    });
  }
};

export const updateSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    if (survey.creator.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Solo el creador puede editar la encuesta' });
    }

    if (survey.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden editar encuestas en borrador',
      });
    }

    const {
      title,
      description,
      channel,
      questions,
      anonymous,
      allowMultipleResponses,
      expiresAt,
      targetUsers,
    } = req.body;

    if (title !== undefined) survey.title = title;
    if (description !== undefined) survey.description = description;
    if (channel !== undefined) survey.channel = channel;
    if (questions !== undefined) survey.questions = questions;
    if (anonymous !== undefined) survey.anonymous = anonymous;
    if (allowMultipleResponses !== undefined) survey.allowMultipleResponses = allowMultipleResponses;
    if (expiresAt !== undefined) survey.expiresAt = expiresAt;
    if (targetUsers !== undefined) survey.targetUsers = targetUsers;

    await survey.save();

    res.json({ success: true, data: survey });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar encuesta',
      error: error.message,
    });
  }
};

export const deleteSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    if (survey.creator.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Solo el creador puede eliminar la encuesta' });
    }

    await Survey.findByIdAndDelete(surveyId);
    res.json({ success: true, message: 'Encuesta eliminada' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar encuesta',
      error: error.message,
    });
  }
};

export const activateSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = survey.creator.toString() === userId;
    const isManagerOrAbove = user && ['owner', 'admin', 'manager'].includes(user.role);
    if (!isCreator && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para activar esta encuesta' });
    }

    if (survey.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden activar encuestas en borrador',
      });
    }

    if (!survey.questions.length) {
      return res.status(400).json({
        success: false,
        message: 'No se puede activar una encuesta sin preguntas',
      });
    }

    survey.status = 'active';
    await survey.save();

    // Actualizar mensaje en chat si existe
    if (survey.channel) {
      await Message.findOneAndUpdate(
        { 'pollData.surveyId': survey._id, type: 'poll' },
        { $set: { 'pollData.question': `${survey.title} (Activa)` } }
      );
      const io = req.app.get('io');
      if (io) {
        io.to(survey.channel.toString()).emit('survey-status-changed', {
          surveyId: survey._id,
          status: 'active',
        });
      }
    }

    logAction(userId, 'survey.activated', 'modify', surveyId, 'Survey',
      { title: survey.title },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, data: survey });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al activar encuesta',
      error: error.message,
    });
  }
};

export const closeSurvey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = survey.creator.toString() === userId;
    const isManagerOrAbove = user && ['owner', 'admin', 'manager'].includes(user.role);
    if (!isCreator && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para cerrar esta encuesta' });
    }

    if (survey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden cerrar encuestas activas',
      });
    }

    survey.status = 'closed';
    await survey.save();

    // Actualizar mensaje en chat si existe
    if (survey.channel) {
      await Message.findOneAndUpdate(
        { 'pollData.surveyId': survey._id, type: 'poll' },
        { $set: { 'pollData.question': `${survey.title} (Cerrada)` } }
      );
      const io = req.app.get('io');
      if (io) {
        io.to(survey.channel.toString()).emit('survey-status-changed', {
          surveyId: survey._id,
          status: 'closed',
        });
      }
    }

    logAction(userId, 'survey.closed', 'modify', surveyId, 'Survey',
      { title: survey.title, responsesCount: survey.responses.length },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, data: survey });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cerrar encuesta',
      error: error.message,
    });
  }
};

export const submitResponse = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;
    const { answers } = req.body;

    if (!answers || !answers.length) {
      return res
        .status(400)
        .json({ success: false, message: 'answers es requerido' });
    }

    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    if (survey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden responder encuestas activas',
      });
    }

    if (survey.expiresAt && new Date() > survey.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Esta encuesta ya expiro',
      });
    }

    if (!survey.allowMultipleResponses) {
      const alreadyResponded = survey.responses.some(
        (r: any) => r.respondent.toString() === userId
      );
      if (alreadyResponded) {
        return res.status(400).json({
          success: false,
          message: 'Ya has respondido esta encuesta',
        });
      }
    }

    for (const answer of answers) {
      if (answer.questionIndex === undefined || answer.value === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Cada respuesta debe tener questionIndex y value',
        });
      }

      const question = survey.questions[answer.questionIndex];
      if (!question) {
        return res.status(400).json({
          success: false,
          message: `Pregunta en indice ${answer.questionIndex} no existe`,
        });
      }

      if (question.required && (answer.value === '' || answer.value === null || answer.value === undefined)) {
        return res.status(400).json({
          success: false,
          message: `La pregunta "${question.text}" es requerida`,
        });
      }

      if (question.type === 'rating') {
        const numVal = Number(answer.value);
        const max = question.maxRating || 5;
        if (isNaN(numVal) || numVal < 1 || numVal > max) {
          return res.status(400).json({
            success: false,
            message: `El rating debe estar entre 1 y ${max}`,
          });
        }
      }

      if (question.type === 'yes_no') {
        const valid = ['si', 'no', 'yes', 'no', true, false, 'Si', 'No', 'YES', 'NO'];
        if (!valid.includes(answer.value)) {
          return res.status(400).json({
            success: false,
            message: `La respuesta debe ser Si o No`,
          });
        }
      }

      if (
        (question.type === 'multiple_choice' || question.type === 'single_choice') &&
        question.options?.length
      ) {
        if (typeof answer.value === 'string' && !question.options.includes(answer.value)) {
          return res.status(400).json({
            success: false,
            message: `Opcion "${answer.value}" no es valida para la pregunta "${question.text}"`,
          });
        }
      }
    }

    survey.responses.push({
      respondent: survey.anonymous
        ? (null as any)
        : (userId as any),
      answers,
      submittedAt: new Date(),
    });

    await survey.save();

    // Notificar via socket (el voto del poll en chat es independiente)
    if (survey.channel) {
      const io = req.app.get('io');
      if (io) {
        io.to(survey.channel.toString()).emit('survey-response-updated', {
          surveyId: survey._id,
          responseCount: survey.responses.length,
        });
      }
    }

    res.status(201).json({ success: true, message: 'Respuesta registrada exitosamente' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al enviar respuesta',
      error: error.message,
    });
  }
};

export const getSurveyResults = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { surveyId } = req.params;

    const survey = await Survey.findById(surveyId)
      .populate('creator', 'username email avatar')
      .populate('channel', 'name platform')
      .lean() as any;

    if (!survey) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const creatorId = survey.creator?._id?.toString() || survey.creator?.toString() || '';
    const isCreator = creatorId === userId;
    if (!isCreator && survey.status === 'draft') {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta encuesta' });
    }

    const totalResponses = survey.responses.length;

    const results = survey.questions.map((question: any, index: number) => {
      const questionResponses = survey.responses
        .map((r: any) => r.answers.find((a: any) => a.questionIndex === index))
        .filter(Boolean);

      const base = {
        questionIndex: index,
        text: question.text,
        type: question.type,
        totalAnswers: questionResponses.length,
      };

      if (question.type === 'multiple_choice' || question.type === 'single_choice') {
        const counts: Record<string, number> = {};
        for (const opt of question.options || []) {
          counts[opt] = 0;
        }
        for (const resp of questionResponses) {
          const val = String(resp.value);
          counts[val] = (counts[val] || 0) + 1;
        }

        const distribution = Object.entries(counts).map(([option, count]) => ({
          option,
          count,
          percentage:
            questionResponses.length > 0
              ? Math.round((count / questionResponses.length) * 10000) / 100
              : 0,
        }));

        return { ...base, distribution };
      }

      if (question.type === 'yes_no') {
        const yes = questionResponses.filter((r: any) => r.value === 'yes' || r.value === 'Si' || r.value === 'YES' || r.value === true).length;
        const no = questionResponses.filter((r: any) => r.value === 'no' || r.value === 'No' || r.value === 'NO' || r.value === false).length;

        return {
          ...base,
          distribution: [
            { option: 'Si', count: yes, percentage: questionResponses.length > 0 ? Math.round((yes / questionResponses.length) * 10000) / 100 : 0 },
            { option: 'No', count: no, percentage: questionResponses.length > 0 ? Math.round((no / questionResponses.length) * 10000) / 100 : 0 },
          ],
        };
      }

      if (question.type === 'rating') {
        const values = questionResponses.map((r: any) => Number(r.value)).filter((v: number) => !isNaN(v));
        const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
        const max = question.maxRating || 5;

        return {
          ...base,
          averageRating: Math.round(avg * 100) / 100,
          maxRating: max,
          distribution: Array.from({ length: max }, (_, i) => i + 1).map((rating) => ({
            rating,
            count: values.filter((v: number) => v === rating).length,
          })),
        };
      }

      if (question.type === 'text') {
        const textResponses = questionResponses.map((r: any) => ({
          value: r.value,
          submittedAt: survey.responses.find((sr: any) =>
            sr.answers.some((a: any) => a.questionIndex === index && a.value === r.value)
          )?.submittedAt,
        }));

        return { ...base, textResponses };
      }

      return base;
    });

    res.json({
      success: true,
      data: {
        survey: {
          _id: survey._id,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          creator: survey.creator,
          channel: survey.channel,
          createdAt: survey.createdAt,
          responseCount: totalResponses,
        },
        totalResponses,
        results,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener resultados',
      error: error.message,
    });
  }
};

export const getSurveyStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const filter = {
      $or: [{ creator: userId }, { targetUsers: userId }],
    };

    const [totalSurveys, surveysByStatus, responseStats, recentSurveys] = await Promise.all([
      Survey.countDocuments(filter),
      Survey.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Survey.aggregate([
        { $match: filter },
        {
          $project: {
            responseCount: { $size: '$responses' },
            questionCount: { $size: '$questions' },
            hasTargetUsers: { $gt: [{ $size: '$targetUsers' }, 0] },
            targetUserCount: { $size: '$targetUsers' },
          },
        },
      ]),
      Survey.find(filter)
        .populate('creator', 'username email avatar')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const statusMap: Record<string, number> = { draft: 0, active: 0, closed: 0 };
    for (const item of surveysByStatus) {
      statusMap[item._id] = item.count;
    }

    const totalResponses = responseStats.reduce(
      (sum: number, s: any) => sum + s.responseCount,
      0
    );

    const avgResponsesPerSurvey =
      totalSurveys > 0 ? Math.round((totalResponses / totalSurveys) * 100) / 100 : 0;

    const surveysWithTargets = responseStats.filter((s: any) => s.hasTargetUsers);
    const completionRate =
      surveysWithTargets.length > 0
        ? Math.round(
            (responseStats.filter((s: any) => s.responseCount > 0 && s.hasTargetUsers).length /
              surveysWithTargets.length) *
              10000
          ) / 100
        : 0;

    const responseRate =
      totalSurveys > 0
        ? Math.round(
            (responseStats.filter((s: any) => s.responseCount > 0).length / totalSurveys) * 10000
          ) / 100
        : 0;

    const activeSurveys = responseStats.filter((s: any) => {
      return s.responseCount > 0;
    });

    const avgResponsesPerActiveSurvey =
      activeSurveys.length > 0
        ? Math.round(
            (activeSurveys.reduce((sum: number, s: any) => sum + s.responseCount, 0) /
              activeSurveys.length) *
              100
          ) / 100
        : 0;

    // Formato que espera el frontend
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // Actividad reciente: encuestas creadas por mes
    const recentActivityAgg = await Survey.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          responses: { $sum: { $size: '$responses' } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]);

    const recentActivity = recentActivityAgg.map((a: any) => ({
      date: a._id,
      count: a.count,
      responses: a.responses,
    }));

    // Agregar responseCount a las encuestas recientes
    const recentSurveysWithCount = recentSurveys.map((s: any) => ({
      ...s,
      responseCount: s.responses ? s.responses.length : 0,
    }));

    res.json({
      success: true,
      data: {
        totalSurveys,
        surveysByStatus: statusMap,
        activeSurveys: statusMap.active || 0,
        totalResponses,
        avgResponsesPerSurvey,
        responseRate,
        completionRate,
        avgResponsesPerActiveSurvey,
        byStatus,
        recentActivity,
        recentSurveys: recentSurveysWithCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadisticas',
      error: error.message,
    });
  }
};
